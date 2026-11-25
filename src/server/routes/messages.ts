import { Ratelimit } from "@upstash/ratelimit";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/db";
import { user as users } from "@/db/auth-schema";
import { messages } from "@/db/schema";
import { redis } from "@/lib/redis";
import { cursorOf, type Message } from "@/lib/types";
import { apiError } from "../errors";
import { publishMessage, subscribeRoom } from "../events";
import { membershipPlugin, roomParams } from "../plugins/membership";

export const messageFields = {
  id: messages.id,
  roomId: messages.roomId,
  userId: messages.userId,
  userName: users.name,
  content: messages.content,
  createdAt: messages.createdAt,
};

export const toMessage = (m: Omit<Message, "createdAt"> & { createdAt: Date }): Message => ({
  ...m,
  createdAt: m.createdAt.toISOString(),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "<ISO createdAt>_<id>" -> pasangan untuk perbandingan baris; null kalau tidak valid. */
export function parseCursor(cursor: string) {
  const [iso, id] = cursor.split("_");
  const at = new Date(iso);
  return !Number.isNaN(at.getTime()) && UUID.test(id ?? "") ? { at: at.toISOString(), id } : null;
}
type Cursor = NonNullable<ReturnType<typeof parseCursor>>;

const selectMessages = () =>
  db.select(messageFields).from(messages).innerJoin(users, eq(users.id, messages.userId));

// shortcut: catch-up dibatasi 1000 pesan; kalau offline lebih lama dari itu, perlu event "reset" agar client memuat ulang.
async function messagesAfter(roomId: string, c: Cursor) {
  const rows = await selectMessages()
    .where(and(eq(messages.roomId, roomId), sql`(${messages.createdAt}, ${messages.id}) > (${c.at}::timestamptz, ${c.id}::uuid)`))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(1000);
  return rows.map(toMessage);
}

const ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "10 s"), prefix: "rl:messages" });

const invalidCursor = apiError("VALIDATION", "Cursor tidak valid.");

export const messageRoutes = new Elysia()
  .use(membershipPlugin)
  .get(
    "/rooms/:id/messages",
    async ({ params, query, status }) => {
      const limit = query.limit ?? 50;
      const cursor = query.cursor ? parseCursor(query.cursor) : null;
      if (query.cursor && !cursor) return status(422, invalidCursor);

      // Terbaru dulu; ambil limit+1 untuk tahu apakah masih ada halaman berikutnya.
      const rows = await selectMessages()
        .where(
          and(
            eq(messages.roomId, params.id),
            cursor ? sql`(${messages.createdAt}, ${messages.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : undefined,
          ),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit).map(toMessage);
      return { items, nextCursor: rows.length > limit ? cursorOf(items[items.length - 1]) : null };
    },
    {
      member: true,
      params: roomParams,
      query: t.Object({
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
    },
  )
  .post(
    "/rooms/:id/messages",
    async ({ params, body, user, status }) => {
      // Redis bermasalah -> izinkan (fail-open), sama seperti perilaku timeout bawaan @upstash/ratelimit.
      const { success } = await ratelimit.limit(user.id).catch((error: unknown) => {
        console.error("[ratelimit]", error);
        return { success: true };
      });
      if (!success) return status(429, apiError("RATE_LIMITED", "Terlalu cepat, tunggu sebentar."));

      const [row] = await db.insert(messages).values({ roomId: params.id, userId: user.id, content: body.content }).returning();
      const message = toMessage({ ...row, userName: user.name });
      // Pesan sudah tersimpan: jangan balas 500 (client akan retry -> pesan dobel). Anggota lain dapat saat reconnect.
      await publishMessage(message).catch((error: unknown) => console.error("[publish]", error));
      return status(201, message);
    },
    {
      member: true,
      params: roomParams,
      body: t.Object({ content: t.String({ minLength: 1, maxLength: 2000, pattern: "\\S" }) }),
    },
  )
  .get(
    "/rooms/:id/stream",
    ({ params, query, headers, request, status, user }) => {
      // Last-Event-ID (reconnect otomatis EventSource) diutamakan; `after` untuk koneksi pertama.
      const from = headers["last-event-id"] ?? query.after;
      const cursor = from ? parseCursor(from) : null;
      if (from && !cursor) return status(422, invalidCursor);

      const encoder = new TextEncoder();
      let closed = false;
      let stop = () => {};

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (chunk: string) => {
            if (!closed) controller.enqueue(encoder.encode(chunk));
          };
          const sendMessage = (m: Message) => send(`id: ${cursorOf(m)}\nevent: message\ndata: ${JSON.stringify(m)}\n\n`);

          let pending: Message[] | null = []; // pesan live yang datang selama catch-up
          let unsubscribe: (() => Promise<void>) | null = null;
          const ping = setInterval(() => send(": ping\n\n"), 25_000);
          stop = () => {
            if (closed) return;
            closed = true;
            clearInterval(ping);
            unsubscribe?.().catch(() => {});
            try {
              controller.close();
            } catch {}
          };
          request.signal.addEventListener("abort", stop);

          try {
            // 1) subscribe dulu, 2) catch-up dari Postgres, 3) teruskan pesan live (tanpa dobel).
            unsubscribe = await subscribeRoom(params.id, (e) => {
              // Dikeluarkan dari room: tutup stream; reconnect berikutnya ditolak 403 oleh macro `member`.
              if ("removedUserId" in e) return void (e.removedUserId === user.id && stop());
              if (pending) pending.push(e);
              else sendMessage(e);
            });
            if (closed) return void unsubscribe().catch(() => {});
            send("retry: 3000\n\n");
            const sent = new Set<string>();
            if (cursor)
              for (const m of await messagesAfter(params.id, cursor)) {
                sent.add(m.id);
                sendMessage(m);
              }
            for (const m of pending) if (!sent.has(m.id)) sendMessage(m);
            pending = null;
          } catch (error) {
            console.error("[stream]", error);
            stop();
          }
        },
        cancel() {
          stop();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform", // no-transform: cegah kompresi yang menahan stream
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    },
    { member: true, params: roomParams, query: t.Object({ after: t.Optional(t.String()) }) },
  );
