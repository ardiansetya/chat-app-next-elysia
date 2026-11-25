import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/db";
import { user as users } from "@/db/auth-schema";
import { messages, roomMembers, rooms } from "@/db/schema";
import type { Room, RoomWithLast } from "@/lib/types";
import { apiError } from "../errors";
import { publishRemoval } from "../events";
import { membershipPlugin, roomParams } from "../plugins/membership";
import { messageFields, toMessage } from "./messages";

const toRoom = (r: typeof rooms.$inferSelect): Room => ({
  id: r.id,
  name: r.name,
  ownerId: r.ownerId,
  createdAt: r.createdAt.toISOString(),
});

export const roomRoutes = new Elysia()
  .use(membershipPlugin)
  .get(
    "/rooms",
    async ({ user }): Promise<RoomWithLast[]> => {
      const mine = await db
        .select({ room: rooms })
        .from(rooms)
        .innerJoin(roomMembers, and(eq(roomMembers.roomId, rooms.id), eq(roomMembers.userId, user.id)));
      if (!mine.length) return [];

      // Satu pesan terbaru per room.
      const last = await db
        .selectDistinctOn([messages.roomId], messageFields)
        .from(messages)
        .innerJoin(users, eq(users.id, messages.userId))
        .where(inArray(messages.roomId, mine.map((r) => r.room.id)))
        .orderBy(messages.roomId, desc(messages.createdAt), desc(messages.id));
      const lastByRoom = new Map(last.map((m) => [m.roomId, toMessage(m)]));

      const activity = (r: RoomWithLast) => r.lastMessage?.createdAt ?? r.createdAt;
      return mine
        .map(({ room }) => ({ ...toRoom(room), lastMessage: lastByRoom.get(room.id) ?? null }))
        .sort((a, b) => activity(b).localeCompare(activity(a)));
    },
    { auth: true },
  )
  .post(
    "/rooms",
    async ({ user, body, status }) => {
      const room = await db.transaction(async (tx) => {
        const [room] = await tx.insert(rooms).values({ name: body.name.trim(), ownerId: user.id }).returning();
        await tx.insert(roomMembers).values({ roomId: room.id, userId: user.id, role: "owner" });
        return room;
      });
      return status(201, toRoom(room));
    },
    // pattern \S: tolak nama yang isinya hanya spasi.
    { auth: true, body: t.Object({ name: t.String({ minLength: 1, maxLength: 50, pattern: "\\S" }) }) },
  )
  .get(
    "/rooms/:id",
    async ({ params, role, status }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.id, params.id));
      if (!room) return status(404, apiError("NOT_FOUND", "Room tidak ditemukan."));
      return { ...toRoom(room), role };
    },
    { member: true, params: roomParams },
  )
  .get(
    "/rooms/:id/members",
    ({ params }) =>
      db
        .select({ userId: roomMembers.userId, name: users.name, role: roomMembers.role })
        .from(roomMembers)
        .innerJoin(users, eq(users.id, roomMembers.userId))
        .where(eq(roomMembers.roomId, params.id))
        .orderBy(asc(roomMembers.role), asc(roomMembers.joinedAt)), // enum: owner dulu
    { member: true, params: roomParams },
  )
  .delete(
    "/rooms/:id/members/:userId",
    async ({ params, status }) => {
      const where = and(eq(roomMembers.roomId, params.id), eq(roomMembers.userId, params.userId));
      const [target] = await db.select({ role: roomMembers.role }).from(roomMembers).where(where);
      if (!target) return status(404, apiError("NOT_FOUND", "Anggota tidak ditemukan."));
      if (target.role === "owner")
        return status(400, apiError("CANNOT_REMOVE_OWNER", "Pemilik room tidak bisa dikeluarkan."));
      await db.delete(roomMembers).where(where);
      // Putuskan stream yang masih terbuka milik anggota itu; gagal publish tidak membatalkan penghapusan.
      await publishRemoval(params.id, params.userId).catch((error: unknown) => console.error("[publish]", error));
      // Response eksplisit tanpa body: status(204) di Node (undici) gagal karena Elysia memberi body.
      return new Response(null, { status: 204 });
    },
    { owner: true, params: t.Object({ id: t.String({ format: "uuid" }), userId: t.String({ minLength: 1 }) }) },
  );
