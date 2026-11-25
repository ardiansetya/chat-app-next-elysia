import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/db";
import { roomInvites, roomMembers, rooms } from "@/db/schema";
import { apiError } from "../errors";
import { membershipPlugin, roomParams } from "../plugins/membership";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const tokenParams = t.Object({ token: t.String({ minLength: 1, maxLength: 100 }) });

/** Undangan valid -> { roomId, roomName }; kalau tidak, respons error 404/410 siap dikembalikan. */
async function findInvite(token: string) {
  const [row] = await db
    .select({ roomId: roomInvites.roomId, roomName: rooms.name, expiresAt: roomInvites.expiresAt })
    .from(roomInvites)
    .innerJoin(rooms, eq(rooms.id, roomInvites.roomId))
    .where(eq(roomInvites.token, token));
  if (!row) return { error: 404 as const };
  if (row.expiresAt.getTime() < Date.now()) return { error: 410 as const };
  return { invite: row };
}

const inviteErrors = {
  404: apiError("NOT_FOUND", "Link undangan tidak ditemukan."),
  410: apiError("INVITE_EXPIRED", "Link undangan sudah kedaluwarsa."),
};

export const inviteRoutes = new Elysia()
  .use(membershipPlugin)
  .post(
    "/rooms/:id/invites",
    async ({ params, user, request }) => {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      await db.insert(roomInvites).values({ token, roomId: params.id, createdBy: user.id, expiresAt });
      return { token, url: new URL(`/invite/${token}`, request.url).toString(), expiresAt: expiresAt.toISOString() };
    },
    { owner: true, params: roomParams },
  )
  // Di luar Kontrak API PRD: halaman /invite/[token] perlu nama room sebelum tombol "Gabung".
  .get(
    "/invites/:token",
    async ({ params, status }) => {
      const res = await findInvite(params.token);
      if (res.error) return status(res.error, inviteErrors[res.error]);
      return { roomId: res.invite.roomId, roomName: res.invite.roomName };
    },
    { auth: true, params: tokenParams },
  )
  .post(
    "/invites/:token/accept",
    async ({ params, user, status }) => {
      const res = await findInvite(params.token);
      if (res.error) return status(res.error, inviteErrors[res.error]);
      await db
        .insert(roomMembers)
        .values({ roomId: res.invite.roomId, userId: user.id })
        .onConflictDoNothing(); // sudah anggota: tetap sukses
      return { roomId: res.invite.roomId };
    },
    { auth: true, params: tokenParams },
  );
