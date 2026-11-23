// shortcut: data in-memory di browser, bentuknya mengikuti Kontrak API di docs/PRD.md.
// Ganti setiap fungsi dengan panggilan Eden Treaty (src/lib/api.ts) saat backend siap.

export type Room = { id: string; name: string; ownerId: string; createdAt: string };
export type RoomWithLast = Room & { lastMessage: Message | null };
export type Role = "owner" | "member";
export type Member = { userId: string; name: string; role: Role };
export type Message = {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
};

export const me = { id: "u1", name: "Kamu", email: "kamu@contoh.com" };

const users: Record<string, string> = { u1: "Kamu", u2: "Budi", u3: "Sari" };

const rooms: Room[] = [
  { id: "r1", name: "Tim Produk", ownerId: "u1", createdAt: "2026-11-01T08:00:00.000Z" },
  { id: "r2", name: "Ngopi Sore", ownerId: "u2", createdAt: "2026-11-10T08:00:00.000Z" },
  { id: "r3", name: "Proyek Kosong", ownerId: "u1", createdAt: "2026-11-20T08:00:00.000Z" },
];

const members: Record<string, Member[]> = {
  r1: [
    { userId: "u1", name: "Kamu", role: "owner" },
    { userId: "u2", name: "Budi", role: "member" },
    { userId: "u3", name: "Sari", role: "member" },
  ],
  r2: [
    { userId: "u2", name: "Budi", role: "owner" },
    { userId: "u1", name: "Kamu", role: "member" },
  ],
  r3: [{ userId: "u1", name: "Kamu", role: "owner" }],
};

// 120 pesan di r1 supaya infinite scroll bisa diuji; urutan lama -> baru.
const messages: Message[] = Array.from({ length: 120 }, (_, i) => {
  const userId = ["u1", "u2", "u2", "u3"][i % 4];
  return {
    id: `m${String(i).padStart(4, "0")}`,
    roomId: "r1",
    userId,
    userName: users[userId],
    content: i === 119 ? "<script>alert(1)</script> harus tampil sebagai teks" : `Pesan ke-${i + 1}`,
    createdAt: new Date(Date.UTC(2026, 10, 23, 8, 0) + i * 90_000).toISOString(),
  };
});
messages.push({
  id: "m9000",
  roomId: "r2",
  userId: "u2",
  userName: "Budi",
  content: "Ada yang mau kopi?",
  createdAt: "2026-11-22T15:00:00.000Z",
});

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const cursorOf = (m: Message) => `${m.createdAt}_${m.id}`;

export async function getRooms(): Promise<RoomWithLast[]> {
  await delay();
  return rooms
    .filter((r) => members[r.id]?.some((m) => m.userId === me.id))
    .map((r) => ({ ...r, lastMessage: messages.findLast((m) => m.roomId === r.id) ?? null }))
    .sort((a, b) =>
      (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(a.lastMessage?.createdAt ?? a.createdAt),
    );
}

export async function createRoom(name: string): Promise<Room> {
  await delay();
  const room = { id: crypto.randomUUID(), name, ownerId: me.id, createdAt: new Date().toISOString() };
  rooms.push(room);
  members[room.id] = [{ userId: me.id, name: me.name, role: "owner" }];
  return room;
}

export async function getRoom(id: string): Promise<(Room & { role: Role }) | null> {
  await delay();
  const room = rooms.find((r) => r.id === id);
  const mine = members[id]?.find((m) => m.userId === me.id);
  return room && mine ? { ...room, role: mine.role } : null;
}

export async function getMembers(roomId: string): Promise<Member[]> {
  await delay(150);
  return [...(members[roomId] ?? [])];
}

export async function removeMember(roomId: string, userId: string): Promise<void> {
  await delay(150);
  members[roomId] = (members[roomId] ?? []).filter((m) => m.userId !== userId);
}

export async function createInvite(roomId: string) {
  await delay(150);
  const token = `${roomId}.${crypto.randomUUID()}`;
  return {
    token,
    url: `${location.origin}/invite/${token}`,
    expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
  };
}

export async function getInvite(token: string): Promise<{ roomId: string; roomName: string } | null> {
  await delay();
  const room = rooms.find((r) => r.id === token.split(".")[0]);
  return room ? { roomId: room.id, roomName: room.name } : null;
}

export async function acceptInvite(token: string): Promise<{ roomId: string }> {
  await delay();
  const roomId = token.split(".")[0];
  const list = (members[roomId] ??= []);
  if (!list.some((m) => m.userId === me.id)) list.push({ userId: me.id, name: me.name, role: "member" });
  return { roomId };
}

/** Terbaru dulu, seperti GET /api/rooms/:id/messages. */
export async function getMessages(roomId: string, cursor: string | null, limit = 50) {
  await delay(400);
  const all = messages.filter((m) => m.roomId === roomId).reverse();
  const start = cursor ? all.findIndex((m) => cursorOf(m) === cursor) + 1 : 0;
  const items = all.slice(start, start + limit);
  const nextCursor = start + limit < all.length ? cursorOf(items[items.length - 1]) : null;
  return { items, nextCursor };
}

export async function sendMessage(roomId: string, content: string): Promise<Message> {
  await delay(500);
  const msg = {
    id: crypto.randomUUID(),
    roomId,
    userId: me.id,
    userName: me.name,
    content,
    createdAt: new Date().toISOString(),
  };
  messages.push(msg);
  return msg;
}
