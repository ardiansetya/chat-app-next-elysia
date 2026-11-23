# PRD Vibe Coding — Chat App

Nov 23, 2026 · @Michelle

Dokumen ini adalah spesifikasi siap-pakai untuk AI coding agent (Claude Code, Cursor, dan sejenisnya) agar membangun Chat App Next.js + Elysia + Upstash secara bertahap tanpa menebak-nebak.

## Cara pakai

Berikan seluruh dokumen ke AI sekali sebagai konteks, lalu kerjakan **satu fase per sesi** dari bagian Rencana build.

1. Ekspor dokumen ini ke Markdown dan simpan sebagai `docs/PRD.md` di root project.
2. Salin isi bagian *Aturan wajib untuk AI* ke `CLAUDE.md` (Claude Code) atau `.cursor/rules` (Cursor), supaya aturannya selalu terbaca.
3. Mulai sesi baru, lalu kirim prompt fase yang sedang dikerjakan, persis seperti tertulis.
4. Setelah AI selesai, jalankan *Cek selesai* fase tersebut sendiri. Jangan lanjut kalau masih ada yang gagal.
5. Commit dengan pesan `fase N: <judul>`, lalu lanjut ke fase berikutnya di sesi baru.

**Kenapa per fase:** konteks AI tetap kecil dan fokus, kesalahan ketahuan lebih awal, dan setiap commit adalah titik aman untuk kembali kalau AI merusak sesuatu.

## Konteks proyek dan tech stack

Chat App adalah aplikasi chat real-time berbasis room: pengguna mendaftar, membuat room, mengundang anggota lewat link, dan bertukar pesan yang langsung muncul di layar anggota lain. Frontend dan backend berada dalam **satu project Next.js**.

| Lapisan | Pilihan (jangan diganti) |
| --- | --- |
| Package manager & runtime dev | Bun |
| Framework | Next.js App Router, TypeScript strict, folder `src/` |
| Styling | Tailwind CSS + shadcn/ui |
| API | Elysia di `src/app/api/[[...slugs]]/route.ts`, Node runtime |
| Client API | Eden Treaty (`@elysiajs/eden`) |
| Auth | Better Auth, email + password, route `src/app/api/auth/[...all]/route.ts` |
| Database | PostgreSQL + Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `pg`) |
| Real-time | Server-Sent Events + Upstash Redis Pub/Sub (`@upstash/redis`) |
| Rate limit | `@upstash/ratelimit` |
| Validasi client | Zod hanya untuk form; validasi API memakai `t` dari Elysia |

**Keputusan yang sudah final:**

- Real-time memakai **SSE, bukan WebSocket**. `.ws()` Elysia tidak berjalan di Route Handler Next.js.
- Postgres adalah sumber kebenaran pesan. Redis hanya untuk menyebarkan pesan dan rate limit.
- Tidak ada server terpisah. Semua jalan dengan `bun dev`.

**Di luar lingkup:** voice/video, enkripsi end-to-end, DM, aplikasi mobile, OAuth (fase berikutnya).

## Aturan wajib untuk AI

Salin blok ini apa adanya ke `CLAUDE.md` atau `.cursor/rules`.

```markdown
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
```

## Struktur folder dan environment

AI harus membuat file di lokasi persis seperti di bawah ini.

```text
chat-app/
├─ docs/PRD.md
├─ drizzle.config.ts
├─ .env.example
└─ src/
   ├─ app/
   │  ├─ (auth)/login/page.tsx
   │  ├─ (auth)/register/page.tsx
   │  ├─ rooms/page.tsx              # daftar room
   │  ├─ rooms/[id]/page.tsx         # layar chat
   │  ├─ invite/[token]/page.tsx     # terima undangan
   │  ├─ api/auth/[...all]/route.ts  # Better Auth
   │  └─ api/[[...slugs]]/route.ts   # Elysia
   ├─ components/
   │  ├─ ui/                         # shadcn/ui
   │  └─ chat/                       # message-list, message-input, room-sidebar
   ├─ db/
   │  ├─ index.ts
   │  ├─ auth-schema.ts              # hasil generate Better Auth
   │  └─ schema.ts                   # tabel aplikasi
   ├─ lib/
   │  ├─ auth.ts  auth-client.ts
   │  ├─ api.ts                      # Eden Treaty
   │  └─ redis.ts
   ├─ server/
   │  ├─ index.ts                    # Elysia app + export type App
   │  ├─ plugins/auth.ts             # macro auth
   │  ├─ plugins/membership.ts       # cek anggota room
   │  ├─ events.ts                   # publish/subscribe Upstash
   │  └─ routes/rooms.ts  messages.ts  invites.ts
   └─ middleware.ts                   # redirect yang belum login
```

**`.env.example`**

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/chat
BETTER_AUTH_SECRET=ganti-dengan-string-acak-32-karakter
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxx
```

**Script `package.json` yang wajib ada:** `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`), `db:generate`, `db:push`.

## Skema database

Tabel auth (`user`, `session`, `account`, `verification`) di-generate dengan `bunx @better-auth/cli generate` ke `src/db/auth-schema.ts`. Tabel aplikasi di `src/db/schema.ts` harus persis seperti ini:

```typescript
import { pgTable, pgEnum, text, timestamp, uuid, primaryKey, index } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const memberRole = pgEnum("member_role", ["owner", "member"]);

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const roomMembers = pgTable("room_members", {
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: memberRole("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.roomId, t.userId] })]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }) /* milidetik, sama dengan Date JS */.defaultNow().notNull(),
}, (t) => [index("messages_room_created_idx").on(t.roomId, t.createdAt, t.id)]);

export const roomInvites = pgTable("room_invites", {
  token: text("token").primaryKey(),            // crypto.randomUUID()
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull().references(() => user.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // +7 hari
});
```

**Cursor pesan:** pakai pasangan (`createdAt`, `id`) supaya dua pesan dengan timestamp sama tidak terlewat. Encode sebagai string `"<ISO createdAt>_<id>"`.

## Kontrak API

Semua route Elysia memakai prefix `/api` dan macro `auth: true` (401 kalau belum login). Route bertanda **Anggota** juga mengecek keanggotaan room (403 kalau bukan).

| Method | Path | Akses | Body / Query | Respons sukses |
| --- | --- | --- | --- | --- |
| GET | `/api/rooms` | Login | — | `Room[]` + `lastMessage`, urut pesan terbaru |
| POST | `/api/rooms` | Login | `{ name: string 1–50 }` | `201 Room`; pembuat jadi `owner` |
| GET | `/api/rooms/:id` | Anggota | — | `Room` + `role` saya |
| GET | `/api/rooms/:id/members` | Anggota | — | `{ userId, name, role }[]` |
| DELETE | `/api/rooms/:id/members/:userId` | Pemilik | — | `204`; owner tidak bisa dikeluarkan (400) |
| POST | `/api/rooms/:id/invites` | Pemilik | — | `{ token, url, expiresAt }` |
| POST | `/api/invites/:token/accept` | Login | — | `{ roomId }`; token kedaluwarsa → 410 |
| GET | `/api/rooms/:id/messages` | Anggota | `?cursor=<createdAt_id>&limit=50` | `{ items: Message[], nextCursor: string \| null }`, terbaru dulu |
| POST | `/api/rooms/:id/messages` | Anggota | `{ content: string 1–2000 }` | `201 Message`; lebih dari 10 / 10 detik → 429 |
| GET | `/api/rooms/:id/stream` | Anggota | header `Last-Event-ID` (opsional) | `text/event-stream` |

**Tipe data**

```typescript
type Room = { id: string; name: string; ownerId: string; createdAt: string };
type Message = {
  id: string; roomId: string; userId: string; userName: string;
  content: string; createdAt: string; // ISO
};
```

**Format SSE**

```text
id: 2026-11-23T10:00:00.123Z_6f1c...
event: message
data: {"id":"6f1c...","roomId":"...","userName":"Budi","content":"halo",...}

: ping            <- komentar setiap 25 detik
```

**Alur stream:** subscribe ke channel Upstash `room:<id>` dulu, lalu kalau ada `Last-Event-ID` kirim pesan setelah cursor itu dari Postgres, lalu teruskan pesan baru. Saat request di-abort: unsubscribe dan hentikan ping.

**Kode error:** `UNAUTHORIZED` (401), `NOT_MEMBER` (403), `NOT_OWNER` (403), `NOT_FOUND` (404), `INVITE_EXPIRED` (410), `RATE_LIMITED` (429), `VALIDATION` (422).

## Halaman dan UI

UI memakai komponen shadcn/ui, desain bersih, responsif mulai lebar 360 px, dan mendukung dark mode.

| Route | Akses | Isi dan perilaku |
| --- | --- | --- |
| `/login` | Publik | Form email + password, link ke `/register`; sukses → `/rooms` atau `?next=` |
| `/register` | Publik | Form nama, email, password (min 8); sukses → `/rooms` |
| `/rooms` | Login | Desktop: sidebar daftar room + panel kosong "Pilih room". Mobile: daftar room penuh. Tombol "Room baru" membuka dialog |
| `/rooms/[id]` | Anggota | Sidebar room (desktop), header (nama room, jumlah anggota, menu anggota/undang), daftar pesan, input pesan |
| `/invite/[token]` | Login | Tampilkan nama room + tombol "Gabung"; belum login → `/login?next=/invite/[token]` |

**Perilaku layar chat (`/rooms/[id]`)**

- Muat 50 pesan terbaru, scroll ke bawah otomatis.
- Scroll ke atas memuat halaman berikutnya dengan `nextCursor`, posisi scroll tidak melompat.
- Pesan sendiri rata kanan, pesan orang lain rata kiri dengan nama + jam (format `HH:mm`).
- Pesan berturut-turut dari pengirim yang sama dalam 5 menit digabung tanpa mengulang nama.
- Enter mengirim, Shift+Enter baris baru. Input dikosongkan dan pesan tampil seketika dengan status "mengirim"; kalau gagal, tampil tombol "Coba lagi".
- Kalau ada pesan baru saat user sedang scroll ke atas, tampilkan tombol "Pesan baru ↓", jangan auto-scroll.
- Banner kuning "Menyambungkan kembali…" tampil saat `EventSource` error, hilang saat tersambung.
- Error 429 tampil sebagai toast "Terlalu cepat, tunggu sebentar".

**State kosong dan loading:** skeleton saat memuat; "Belum ada pesan. Sapa anggota lain!" untuk room kosong; "Belum ada room" + tombol buat room di `/rooms`.

## Rencana build bertahap

Ada 7 fase. Kirim prompt tiap fase di sesi baru, lalu centang *Cek selesai* sebelum lanjut.

### Fase 0 — Setup project

```text
Baca docs/PRD.md. Kerjakan HANYA Fase 0.
Buat project Next.js (App Router, TypeScript, Tailwind, src/) dengan Bun.
Install: elysia @elysiajs/eden better-auth drizzle-orm pg @upstash/redis @upstash/ratelimit,
dev: drizzle-kit @types/pg. Inisialisasi shadcn/ui (button, input, dialog, toast, skeleton, avatar).
Buat .env.example, drizzle.config.ts, src/db/index.ts, dan script package.json sesuai PRD.
Buat src/server/index.ts berisi Elysia prefix /api dengan GET /api/health -> { ok: true },
pasang di src/app/api/[[...slugs]]/route.ts (runtime nodejs, dynamic force-dynamic),
dan src/lib/api.ts (Eden Treaty). Jangan buat fitur lain.
```

- [ ] `bun dev` jalan dan `GET /api/health` mengembalikan `{ ok: true }`
- [ ] `bun run typecheck` dan `bun run lint` lulus

### Fase 1 — Auth

```text
Kerjakan HANYA Fase 1 dari docs/PRD.md.
Setup Better Auth (email + password, Drizzle adapter) di src/lib/auth.ts dan auth-client.ts,
route src/app/api/auth/[...all]/route.ts, generate auth-schema.ts lalu db:push.
Buat plugin Elysia src/server/plugins/auth.ts berisi macro `auth` (401 kalau tanpa session).
Buat halaman /login dan /register sesuai bagian Halaman dan UI, serta middleware.ts
yang mengalihkan pengguna belum login dari /rooms dan /invite ke /login?next=...
Tambahkan GET /api/me (auth: true) untuk uji.
```

- [ ] Daftar, login, logout berfungsi; session bertahan setelah browser ditutup
- [ ] `GET /api/me` tanpa login → 401, setelah login → data user

### Fase 2 — Room dan keanggotaan

```text
Kerjakan HANYA Fase 2 dari docs/PRD.md.
Tambahkan tabel di src/db/schema.ts persis seperti PRD, lalu db:push.
Buat plugin membership (403 NOT_MEMBER / NOT_OWNER) dan route rooms + invites
sesuai Kontrak API (kecuali messages dan stream).
Buat halaman /rooms (daftar + dialog room baru) dan /invite/[token].
```

- [ ] Buat room, salin link undangan, akun kedua bisa gabung lewat link
- [ ] Akun yang bukan anggota mendapat 403 saat membuka `/api/rooms/:id`

### Fase 3 — Pesan dan riwayat (tanpa real-time)

```text
Kerjakan HANYA Fase 3 dari docs/PRD.md.
Buat GET/POST /api/rooms/:id/messages dengan cursor (createdAt_id) dan limit 50.
Buat halaman /rooms/[id]: daftar pesan, infinite scroll ke atas, input pesan
(Enter kirim, Shift+Enter baris baru), optimistic update dengan status mengirim/gagal.
Belum ada real-time: pesan orang lain muncul setelah refresh.
```

- [ ] Kirim pesan, refresh, pesan tetap ada
- [ ] Dengan 120 pesan, scroll ke atas memuat semuanya tanpa duplikat

### Fase 4 — Real-time dengan SSE + Upstash

```text
Kerjakan HANYA Fase 4 dari docs/PRD.md.
Buat src/lib/redis.ts (Redis.fromEnv) dan src/server/events.ts (publish/subscribe channel room:<id>).
POST messages: setelah insert, await publish. Buat GET /api/rooms/:id/stream sesuai
"Format SSE" dan "Alur stream" di PRD (subscribe dulu, lalu catch-up Last-Event-ID, ping 25 detik,
bersihkan saat abort). Di client: EventSource, dedupe berdasarkan id, banner reconnect,
tombol "Pesan baru" saat user scroll ke atas.
```

- [ ] Dua browser (dua akun) saling melihat pesan tanpa refresh, di bawah 1 detik
- [ ] Matikan Wi-Fi 30 detik saat akun lain mengirim 3 pesan; setelah tersambung, ketiganya muncul tanpa duplikat

### Fase 5 — Rate limit dan pengerasan

```text
Kerjakan HANYA Fase 5 dari docs/PRD.md.
Tambahkan @upstash/ratelimit: 10 pesan / 10 detik per user (429 RATE_LIMITED + toast).
Seragamkan semua error API ke format { error: { code, message } } dengan onError Elysia.
Pastikan semua route room memakai plugin membership. Tambahkan state kosong dan skeleton.
```

- [ ] Mengirim 15 pesan cepat → pesan ke-11 dst ditolak dengan toast
- [ ] Semua respons error memakai format yang sama

### Fase 6 — Polish dan deploy

```text
Kerjakan HANYA Fase 6 dari docs/PRD.md.
Rapikan UI responsif (360 px sampai desktop) dan dark mode, gabungkan pesan berturut-turut,
kelola anggota (lihat daftar, owner bisa mengeluarkan). Siapkan deploy:
export maxDuration di route Elysia, README berisi langkah setup lokal dan deploy.
```

- [ ] Jalankan seluruh checklist Definition of done di bawah

## Definition of done

MVP selesai kalau semua poin ini lulus di environment production, diuji dengan dua akun di dua browser.

- [ ] Daftar, login, logout, dan redirect `?next=` berfungsi
- [ ] Halaman terlindungi tidak bisa dibuka tanpa login
- [ ] Buat room, undang lewat link, akun kedua bergabung
- [ ] Owner mengeluarkan anggota; anggota itu langsung mendapat 403 dan stream-nya tertutup saat reconnect
- [ ] Pesan muncul di browser lain dalam waktu kurang dari 1 detik
- [ ] Tidak ada pesan hilang atau dobel setelah koneksi diputus 30 detik
- [ ] Riwayat 200+ pesan bisa digulir sampai pesan pertama
- [ ] Rate limit aktif dan tampil sebagai toast
- [ ] Pesan berisi `<script>alert(1)</script>` tampil sebagai teks biasa
- [ ] Tampilan rapi di lebar 360 px dan desktop, light dan dark mode
- [ ] `bun run build`, `typecheck`, dan `lint` lulus tanpa error
- [ ] Tidak ada secret di repo; `.env.example` lengkap; README menjelaskan setup
