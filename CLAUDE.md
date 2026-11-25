@AGENTS.md

# Aturan project Chat App

## Umum
- Baca docs/PRD.md sebelum mulai. Kerjakan HANYA fase yang diminta.
- Jangan menambah library di luar tech stack PRD tanpa bertanya dulu.
- Jangan mengganti SSE dengan WebSocket, dan jangan membuat server terpisah.
- Kalau spesifikasi ambigu, tanya dulu; jangan menebak.
- Setelah selesai, jalankan `bun run lint` dan `bun run typecheck`, lalu laporkan hasilnya apa adanya.

## Kode
- TypeScript strict. Dilarang `any` dan `@ts-ignore`.
- Semua endpoint API ditulis di Elysia (src/server), bukan Route Handler Next.js biasa.
- Validasi body/params/query dengan `t` dari Elysia di setiap route.
- Client memanggil API lewat Eden Treaty (`src/lib/api.ts`), bukan fetch manual.
  Pengecualian: EventSource untuk SSE.
- Akses database hanya lewat Drizzle di src/server atau src/db.
- Komponen client diberi "use client" hanya kalau butuh state/efek.
- Nama file kebab-case, komponen React PascalCase.

## Keamanan
- Setiap route room WAJIB mengecek user adalah anggota room (403 kalau bukan).
- Jangan pernah render konten pesan sebagai HTML (tanpa dangerouslySetInnerHTML).
- Secret hanya dari process.env; jangan hardcode dan jangan commit .env.

## Format respons error API
- { "error": { "code": "STRING_KODE", "message": "pesan untuk manusia" } }

## Status
- Fase 0–6 selesai. Postgres lokal: `docker compose up -d`. Tes integrasi API: `bun run test`.
- Tambahan di luar Kontrak API PRD: `GET /api/invites/:token` (nama room untuk halaman undangan),
  query `?after=<cursor>` di `/stream` (koneksi pertama, setara Last-Event-ID), kode error `CANNOT_REMOVE_OWNER` (400) dan `INTERNAL` (500).
- Eden dibuat dengan `parseDate: false`; tanpa itu Eden mengubah setiap string ISO (termasuk isi pesan) jadi Date.
- Jika Upstash gagal: rate limit fail-open dan publish hanya di-log (pesan sudah tersimpan; jangan balas 500 agar tidak dobel saat retry).
- Respons 204 harus `new Response(null, { status: 204 })`; `status(204)` Elysia gagal di runtime Node.

## Catatan Next.js 16 (berbeda dari PRD)
- Cache Components aktif: komponen yang membaca params/searchParams/useParams harus di dalam `<Suspense>` atau `loading.tsx`.
- Route segment config `runtime` dan `dynamic` DITOLAK di bawah Cache Components; jangan ditambahkan ke route handler.
- `middleware.ts` sudah deprecated; pengalihan login ada di `src/proxy.ts`.
- Schema auth di-generate dengan CLI baru: `bunx auth@<versi better-auth> generate --config src/lib/auth.ts --output src/db/auth-schema.ts -y`
  (`@better-auth/cli` sudah tidak didukung).
