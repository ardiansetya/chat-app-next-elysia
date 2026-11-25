// Tes integrasi API Elysia terhadap Postgres asli (`docker compose up -d`). Jalankan: `bun test`.
// Upstash (pub/sub + rate limit) diganti versi in-memory supaya tes tidak butuh kredensial.
// Dikecualikan dari tsconfig (tipe bun:test butuh @types/bun yang belum dipasang).
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { Message } from "@/lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const listeners = new Map<string, Set<(m: Message) => void>>();
let onSubscribe: ((roomId: string, deliver: (m: Message) => void) => Promise<void>) | null = null;

let redisDown = false;

mock.module("./events", () => ({
  publishMessage: async (m: Message) => {
    if (redisDown) throw new Error("redis down");
    listeners.get(m.roomId)?.forEach((l) => l(m));
  },
  publishRemoval: async (roomId: string, userId: string) =>
    listeners.get(roomId)?.forEach((l) => (l as (e: { removedUserId: string }) => void)({ removedUserId: userId })),
  subscribeRoom: async (roomId: string, cb: (m: Message) => void) => {
    if (!listeners.has(roomId)) listeners.set(roomId, new Set());
    listeners.get(roomId)!.add(cb);
    await onSubscribe?.(roomId, cb);
    return async () => void listeners.get(roomId)?.delete(cb);
  },
}));

const hits = new Map<string, number>();
mock.module("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    async limit(key: string) {
      if (redisDown) throw new Error("redis down");
      hits.set(key, (hits.get(key) ?? 0) + 1);
      return { success: hits.get(key)! <= 10 };
    }
  },
}));

const { app } = await import("./index");
const { auth } = await import("@/lib/auth");
const { db } = await import("@/db");
const { user: users } = await import("@/db/auth-schema");
const { messages, roomInvites, rooms } = await import("@/db/schema");
const { eq, inArray } = await import("drizzle-orm");

type Session = { id: string; cookie: string };
const created: string[] = [];

async function signUp(name: string): Promise<Session> {
  const res = await auth.api.signUpEmail({
    body: { name, email: `${name.toLowerCase()}-${crypto.randomUUID()}@test.local`, password: "rahasia123" },
    asResponse: true,
  });
  const { user } = (await res.json()) as { user: { id: string } };
  created.push(user.id);
  return { id: user.id, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") };
}

function call(s: Session | null, method: string, path: string, body?: unknown, init: RequestInit = {}) {
  const headers: Record<string, string> = {};
  if (s) headers.cookie = s.cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  return app.handle(
    new Request(`http://localhost/api${path}`, {
      ...init,
      method,
      headers: { ...headers, ...(init.headers as Record<string, string>) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

const json = <T>(res: Response) => res.json() as Promise<T>;
const errorCode = async (res: Response) => (await json<{ error: { code: string } }>(res)).error.code;

/** Pembaca SSE: `take(n)` menunggu sampai total n event `message` terkumpul (atau timeout). */
function sse(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: { id: string; data: Message }[] = [];
  let buf = "";
  return {
    events,
    cancel: () => reader.cancel(),
    async take(count: number, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      while (events.length < count && Date.now() < deadline) {
        const chunk = await Promise.race([reader.read(), sleep(deadline - Date.now()).then(() => null)]);
        if (!chunk || chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const id = /^id: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (id && data && /^event: message$/m.test(block)) events.push({ id, data: JSON.parse(data) as Message });
        }
      }
      return events;
    },
  };
}

let owner: Session, member: Session, stranger: Session;
let roomId: string;

beforeAll(async () => {
  [owner, member, stranger] = await Promise.all([signUp("Owner"), signUp("Member"), signUp("Stranger")]);
});

afterAll(async () => {
  // Room dulu (cascade ke anggota, pesan, undangan): room_invites.created_by tidak cascade ke user.
  await db.delete(rooms).where(inArray(rooms.ownerId, created));
  await db.delete(users).where(inArray(users.id, created));
  await db.$client.end();
});

describe("auth & format error", () => {
  test("tanpa login -> 401 UNAUTHORIZED", async () => {
    const res = await call(null, "GET", "/rooms");
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("UNAUTHORIZED");
  });

  test("endpoint tidak ada -> 404 NOT_FOUND", async () => {
    const res = await call(owner, "GET", "/tidak-ada");
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("NOT_FOUND");
  });
});

describe("room & keanggotaan", () => {
  test("buat room -> 201, pembuat jadi owner", async () => {
    const res = await call(owner, "POST", "/rooms", { name: "  Tim Tes  " });
    expect(res.status).toBe(201);
    const room = await json<{ id: string; name: string; ownerId: string }>(res);
    expect(room.name).toBe("Tim Tes");
    expect(room.ownerId).toBe(owner.id);
    roomId = room.id;

    const detail = await json<{ role: string }>(await call(owner, "GET", `/rooms/${roomId}`));
    expect(detail.role).toBe("owner");
  });

  test("nama kosong/spasi atau > 50 -> 422 VALIDATION", async () => {
    for (const name of ["", "   ", "x".repeat(51)]) {
      const res = await call(owner, "POST", "/rooms", { name });
      expect(res.status).toBe(422);
      expect(await errorCode(res)).toBe("VALIDATION");
    }
  });

  test("bukan anggota -> 403 NOT_MEMBER; id bukan uuid -> 422", async () => {
    const res = await call(stranger, "GET", `/rooms/${roomId}`);
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("NOT_MEMBER");
    expect((await call(stranger, "GET", `/rooms/${roomId}/messages`)).status).toBe(403);
    expect((await call(stranger, "GET", `/rooms/${roomId}/stream`)).status).toBe(403);
    expect((await call(owner, "GET", "/rooms/bukan-uuid")).status).toBe(422);
  });

  test("undangan: buat, lihat, terima; kedaluwarsa -> 410; tidak ada -> 404", async () => {
    expect(await errorCode(await call(member, "POST", `/rooms/${roomId}/invites`))).toBe("NOT_MEMBER");

    const invite = await json<{ token: string; url: string }>(await call(owner, "POST", `/rooms/${roomId}/invites`));
    expect(invite.url).toBe(`http://localhost/invite/${invite.token}`);

    const info = await json<{ roomName: string }>(await call(member, "GET", `/invites/${invite.token}`));
    expect(info.roomName).toBe("Tim Tes");
    const accepted = await json<{ roomId: string }>(await call(member, "POST", `/invites/${invite.token}/accept`));
    expect(accepted.roomId).toBe(roomId);
    expect((await call(member, "POST", `/invites/${invite.token}/accept`)).status).toBe(200); // idempoten

    expect(await errorCode(await call(member, "POST", `/rooms/${roomId}/invites`))).toBe("NOT_OWNER");

    await db.update(roomInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(roomInvites.token, invite.token));
    const expired = await call(stranger, "POST", `/invites/${invite.token}/accept`);
    expect(expired.status).toBe(410);
    expect(await errorCode(expired)).toBe("INVITE_EXPIRED");
    expect((await call(stranger, "GET", "/invites/tidak-ada")).status).toBe(404);

    const list = await json<{ userId: string; role: string }[]>(await call(member, "GET", `/rooms/${roomId}/members`));
    expect(list.map((m) => m.role)).toEqual(["owner", "member"]);
  });
});

describe("pesan", () => {
  test("riwayat 120 pesan (timestamp kembar) dipaginasi tanpa duplikat/terlewat", async () => {
    const base = Date.now() - 3_600_000;
    // Setiap pasangan pesan punya createdAt sama persis: cursor harus memakai (createdAt, id).
    const rows = Array.from({ length: 120 }, (_, i) => ({
      roomId,
      userId: i % 2 ? owner.id : member.id,
      content: `Pesan ke-${i + 1}`,
      createdAt: new Date(base + Math.floor(i / 2) * 1000),
    }));
    const inserted = await db.insert(messages).values(rows).returning({ id: messages.id, createdAt: messages.createdAt });
    // Urutan yang diharapkan: (createdAt, id) menurun, sama dengan ORDER BY di server (uuid = urutan hex).
    const expected = inserted
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .map((m) => m.id);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const q: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const page: { items: Message[]; nextCursor: string | null } = await json(await call(member, "GET", `/rooms/${roomId}/messages${q}`));
      expect(page.items.length).toBeLessThanOrEqual(50);
      seen.push(...page.items.map((m) => m.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(new Set(seen).size).toBe(120);
    expect(seen).toEqual(expected);
    const first: { items: Message[] } = await json(await call(member, "GET", `/rooms/${roomId}/messages?limit=1`));
    expect(["Owner", "Member"]).toContain(first.items[0].userName);
  });

  test("cursor rusak -> 422", async () => {
    expect((await call(member, "GET", `/rooms/${roomId}/messages?cursor=abc`)).status).toBe(422);
  });

  test("kirim pesan -> 201; kosong/terlalu panjang -> 422", async () => {
    const res = await call(member, "POST", `/rooms/${roomId}/messages`, { content: "<script>alert(1)</script>" });
    expect(res.status).toBe(201);
    const msg = await json<Message>(res);
    expect(msg.userName).toBe("Member");
    expect(msg.content).toBe("<script>alert(1)</script>");
    for (const content of ["", "   ", "x".repeat(2001)])
      expect((await call(member, "POST", `/rooms/${roomId}/messages`, { content })).status).toBe(422);
  });

  test("lebih dari 10 pesan -> 429 RATE_LIMITED", async () => {
    hits.clear();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await call(owner, "POST", `/rooms/${roomId}/messages`, { content: `cepat ${i}` })).status);
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    hits.clear();
  });
});

test("Upstash gagal -> pesan tetap tersimpan sekali (201), tanpa 500", async () => {
  redisDown = true;
  const res = await call(owner, "POST", `/rooms/${roomId}/messages`, { content: "saat redis mati" });
  redisDown = false;
  expect(res.status).toBe(201);
  const rows = await db.select().from(messages).where(eq(messages.content, "saat redis mati"));
  expect(rows).toHaveLength(1);
});

describe("stream SSE", () => {
  test("catch-up dari cursor, lalu pesan live; pesan saat catch-up tidak dobel", async () => {
    const all: { items: Message[] } = await json(await call(member, "GET", `/rooms/${roomId}/messages?limit=3`));
    const [, , third] = all.items; // terbaru dulu -> catch-up = 2 pesan setelah `third`
    const after = `${third.createdAt}_${third.id}`;

    // Simulasi race: pesan masuk DB dan ter-publish tepat setelah subscribe, sebelum catch-up dibaca.
    let raced: Message | null = null;
    onSubscribe = async (rid, deliver) => {
      const res = await call(owner, "POST", `/rooms/${rid}/messages`, { content: "saat catch-up" });
      raced = await json<Message>(res);
      deliver(raced);
    };
    const res = await call(member, "GET", `/rooms/${roomId}/stream?after=${encodeURIComponent(after)}`);
    onSubscribe = null;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const stream = sse(res);
    await stream.take(3); // 2 catch-up + 1 pesan race
    await call(owner, "POST", `/rooms/${roomId}/messages`, { content: "live" });
    const events = await stream.take(4);
    await sleep(100); // beri waktu kalau ada duplikat yang menyusul
    await stream.take(5, 200);
    await stream.cancel();

    const contents = stream.events.map((e) => e.data.content);
    expect(contents).toEqual([all.items[1].content, all.items[0].content, "saat catch-up", "live"]);
    expect(events[0].id).toBe(`${all.items[1].createdAt}_${all.items[1].id}`);
    expect(raced).not.toBeNull();
  });

  test("Last-Event-ID diutamakan; abort -> unsubscribe", async () => {
    const latest: { items: Message[] } = await json(await call(member, "GET", `/rooms/${roomId}/messages?limit=2`));
    const ctrl = new AbortController();
    const res = await call(member, "GET", `/rooms/${roomId}/stream?after=bukan-dipakai`, undefined, {
      headers: { "last-event-id": `${latest.items[1].createdAt}_${latest.items[1].id}` },
      signal: ctrl.signal,
    });
    expect(res.status).toBe(200);
    const [first] = await sse(res).take(1);
    expect(first.data.id).toBe(latest.items[0].id);

    expect(listeners.get(roomId)?.size).toBe(1);
    ctrl.abort();
    await sleep(50);
    expect(listeners.get(roomId)?.size).toBe(0);
  });
});

describe("kelola anggota", () => {
  test("hanya owner; owner tidak bisa dikeluarkan; anggota yang dikeluarkan langsung 403", async () => {
    expect(await errorCode(await call(member, "DELETE", `/rooms/${roomId}/members/${owner.id}`))).toBe("NOT_OWNER");

    const self = await call(owner, "DELETE", `/rooms/${roomId}/members/${owner.id}`);
    expect(self.status).toBe(400);
    expect(await errorCode(self)).toBe("CANNOT_REMOVE_OWNER");
    expect((await call(owner, "DELETE", `/rooms/${roomId}/members/${stranger.id}`)).status).toBe(404);

    // Stream anggota yang masih terbuka harus ditutup server begitu ia dikeluarkan.
    const open = await call(member, "GET", `/rooms/${roomId}/stream`);
    expect(open.status).toBe(200);
    const reader = open.body!.getReader();
    await reader.read(); // "retry:" -> langganan aktif

    expect((await call(owner, "DELETE", `/rooms/${roomId}/members/${member.id}`)).status).toBe(204);
    const closed = await Promise.race([
      (async () => {
        for (;;) if ((await reader.read()).done) return true;
      })(),
      sleep(2000).then(() => false),
    ]);
    expect(closed).toBe(true);
    expect(await errorCode(await call(member, "GET", `/rooms/${roomId}`))).toBe("NOT_MEMBER");
    expect((await call(member, "GET", `/rooms/${roomId}/stream`)).status).toBe(403);
  });

  test("daftar room: urut aktivitas terbaru, dengan lastMessage", async () => {
    const res = await call(owner, "POST", "/rooms", { name: "Room Baru Kosong" });
    const fresh = await json<{ id: string }>(res);
    const list = await json<{ id: string; lastMessage: Message | null }[]>(await call(owner, "GET", "/rooms"));
    expect(list.map((r) => r.id)).toEqual([fresh.id, roomId]);
    expect(list[0].lastMessage).toBeNull();
    const newest: { items: Message[] } = await json(await call(owner, "GET", `/rooms/${roomId}/messages?limit=1`));
    expect(list[1].lastMessage).toEqual(newest.items[0]);
  });
});
