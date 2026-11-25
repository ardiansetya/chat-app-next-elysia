# Chat App

Chat real-time berbasis room: daftar, buat room, undang anggota lewat link, dan bertukar pesan yang langsung muncul di layar anggota lain.

**Stack:** Next.js 16 (App Router) · Elysia + Eden Treaty · Better Auth · PostgreSQL + Drizzle · Server-Sent Events + Upstash Redis Pub/Sub · `@upstash/ratelimit` · Tailwind + shadcn/ui · Bun.

Spesifikasi lengkap ada di [`docs/PRD.md`](docs/PRD.md).

Dibuat oleh [Ardian Setya Pradana](https://ardiansetya.vercel.app/).

## Setup lokal

Prasyarat: [Bun](https://bun.sh) dan Docker (untuk Postgres lokal).

```bash
bun install
cp .env.example .env          # lalu isi nilainya, lihat tabel di bawah
docker compose up -d          # Postgres di localhost:5432 (user/pass/db: chat)
bun run db:push               # buat tabel
bun dev                       # http://localhost:3000
```

### Environment

| Variabel | Isi |
| --- | --- |
| `DATABASE_URL` | URL Postgres. Lokal: `postgres://chat:chat@localhost:5432/chat` |
| `BETTER_AUTH_SECRET` | String acak ≥ 32 karakter, mis. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | URL publik aplikasi, mis. `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | Sama dengan `BETTER_AUTH_URL` |
| `UPSTASH_REDIS_REST_URL` | Dari dashboard Upstash → database Redis → **REST API** |
| `UPSTASH_REDIS_REST_TOKEN` | Dari tempat yang sama (token *read-write*, bukan read-only) |

Tanpa variabel Upstash, aplikasi tetap jalan (pesan tersimpan dan muncul setelah refresh), tetapi real-time dan rate limit tidak aktif; banner "Menyambungkan kembali…" akan tampil di layar chat.

### Script

| Script | Fungsi |
| --- | --- |
| `bun dev` | Server development |
| `bun run build` / `bun run start` | Build dan jalankan produksi |
| `bun run lint` | ESLint |
| `bun run typecheck` | `next typegen` + `tsc --noEmit` |
| `bun run test` | Tes integrasi API (butuh Postgres dari `docker compose`; Upstash diganti versi in-memory) |
| `bun run db:push` | Sinkronkan schema Drizzle ke database |
| `bun run db:generate` | Buat file migrasi SQL di `drizzle/` |

## Struktur singkat

```text
src/
├─ app/api/[[...slugs]]/route.ts   # semua endpoint Elysia (/api/*)
├─ app/api/auth/[...all]/route.ts  # Better Auth
├─ server/                         # Elysia: routes, plugin auth & membership, pub/sub
├─ db/                             # schema Drizzle (auth-schema.ts hasil generate)
├─ lib/api.ts                      # client Eden Treaty
├─ components/chat/                # UI chat
└─ proxy.ts                        # redirect pengguna belum login (pengganti middleware.ts di Next 16)
```

## Deploy (Vercel)

1. Siapkan Postgres terkelola (Neon, Supabase, dsb.) dan database Redis di [Upstash](https://console.upstash.com).
2. Jalankan `DATABASE_URL=<url produksi> bun run db:push` sekali dari mesin lokal untuk membuat tabel.
3. Import repo ke Vercel, lalu isi semua variabel di tabel Environment. `BETTER_AUTH_URL` dan `NEXT_PUBLIC_APP_URL` diisi domain produksi (mis. `https://chat-kamu.vercel.app`), dan `BETTER_AUTH_SECRET` dibuat baru (jangan pakai nilai lokal).
4. Deploy. Build command dan output memakai default Next.js.

**Catatan SSE:** route API mengekspor `maxDuration = 300`. Saat fungsi serverless mencapai batas itu, koneksi stream ditutup lalu browser otomatis menyambung ulang dengan header `Last-Event-ID`, dan server mengirim pesan yang terlewat dari Postgres, jadi tidak ada pesan yang hilang. Kalau paket Vercel kamu punya batas durasi lebih kecil, turunkan nilai tersebut di `src/app/api/[[...slugs]]/route.ts`.
