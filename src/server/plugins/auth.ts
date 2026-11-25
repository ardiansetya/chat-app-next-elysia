import { Elysia } from "elysia";
import { auth } from "@/lib/auth";
import { apiError } from "../errors";

/** Macro `auth: true` -> 401 tanpa session; kalau ada, inject `user` dan `session` ke handler. */
export const authPlugin = new Elysia({ name: "auth" }).macro("auth", {
  async resolve({ status, request: { headers } }) {
    const session = await auth.api.getSession({ headers });
    if (!session) return status(401, apiError("UNAUTHORIZED", "Silakan masuk terlebih dahulu."));
    return { user: session.user, session: session.session };
  },
});
