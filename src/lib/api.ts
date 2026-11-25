import { treaty } from "@elysiajs/eden";
import type { App } from "@/server";

const origin = typeof window === "undefined" ? process.env.NEXT_PUBLIC_APP_URL! : window.location.origin;

/**
 * Client API bertipe; contoh: `await api.rooms.get()`. Cookie session ikut otomatis (same-origin).
 * parseDate: false -> default Eden mengubah SETIAP string berformat ISO (termasuk isi pesan) menjadi Date.
 */
export const api = treaty<App>(origin, { parseDate: false }).api;

/** Pesan dari format error API { error: { code, message } }. */
export function errorMessage(error: { value: unknown } | null | undefined, fallback = "Terjadi kesalahan, coba lagi.") {
  const value = error?.value as { error?: { message?: string } } | undefined;
  return value?.error?.message ?? fallback;
}
