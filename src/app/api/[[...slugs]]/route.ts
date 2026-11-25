import { app } from "@/server";

// Tanpa `runtime`/`dynamic`: keduanya ditolak di Next 16 + Cache Components. Runtime default sudah
// Node.js, dan handler ini membaca request sehingga selalu berjalan saat request.
// /api/auth/* ditangani route Better Auth yang lebih spesifik.

// Batas umur koneksi SSE di serverless. Saat terputus, EventSource reconnect dengan Last-Event-ID
// dan server mengirim pesan yang terlewat, jadi tidak ada pesan hilang.
export const maxDuration = 300;

export const GET = app.fetch;
export const POST = app.fetch;
export const DELETE = app.fetch;
