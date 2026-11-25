import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "@/db";
import { roomMembers } from "@/db/schema";
import { apiError } from "../errors";
import { authPlugin } from "./auth";

/** Params `:id` room; uuid divalidasi dulu (422) supaya tidak jadi error SQL. */
export const roomParams = t.Object({ id: t.String({ format: "uuid" }) });

/**
 * `member: true` -> login + anggota room `params.id` (403 NOT_MEMBER), inject `role`.
 * `owner: true`  -> seperti member + harus pemilik (403 NOT_OWNER).
 * Room yang tidak ada juga 403, supaya keberadaan room tidak bocor ke non-anggota.
 */
export const membershipPlugin = new Elysia({ name: "membership" })
  .use(authPlugin)
  .macro("member", {
    auth: true,
    async resolve({ user, params, status }) {
      // Macro tidak tahu path route-nya, jadi params bertipe {}; semua route `member` punya `:id` (roomParams).
      const roomId = (params as { id?: string }).id ?? "";
      const [row] = await db
        .select({ role: roomMembers.role })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, user.id)));
      if (!row) return status(403, apiError("NOT_MEMBER", "Kamu bukan anggota room ini."));
      return { role: row.role };
    },
  })
  .macro("owner", {
    member: true,
    resolve({ role, status }) {
      if (role !== "owner") return status(403, apiError("NOT_OWNER", "Hanya pemilik room yang bisa melakukan ini."));
    },
  });
