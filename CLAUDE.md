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

## Status frontend
- UI sudah dibangun lebih dulu dengan data mock di `src/lib/mock-api.ts` (bentuk = Kontrak API PRD).
  Saat fase backend, ganti pemanggilan fungsi mock dengan Eden Treaty lalu hapus file itu.
- Next.js 16 dengan Cache Components: komponen yang membaca params/searchParams/useParams harus di dalam `<Suspense>` atau `loading.tsx`.
