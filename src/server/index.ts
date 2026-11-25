import { Elysia } from "elysia";
import { apiError } from "./errors";
import { authPlugin } from "./plugins/auth";
import { inviteRoutes } from "./routes/invites";
import { messageRoutes } from "./routes/messages";
import { roomRoutes } from "./routes/rooms";

export const app = new Elysia({ prefix: "/api" })
  // Harus didaftarkan sebelum route agar berlaku untuk semuanya.
  .onError(({ code, error, status }) => {
    if (code === "VALIDATION" || code === "PARSE")
      return status(422, apiError("VALIDATION", code === "PARSE" ? "Body request tidak valid." : validationMessage(error.all)));
    if (code === "NOT_FOUND") return status(404, apiError("NOT_FOUND", "Endpoint tidak ditemukan."));
    console.error("[api]", error);
    return status(500, apiError("INTERNAL", "Terjadi kesalahan di server."));
  })
  .use(authPlugin)
  .get("/health", () => ({ ok: true }))
  .get("/me", ({ user }) => user, { auth: true })
  .use(roomRoutes)
  .use(messageRoutes)
  .use(inviteRoutes);

function validationMessage(errors: { path: string; message: string }[]) {
  const first = errors[0];
  return first ? `${first.path || "input"}: ${first.message}` : "Input tidak valid.";
}

export type App = typeof app;
