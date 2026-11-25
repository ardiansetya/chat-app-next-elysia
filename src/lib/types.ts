// Tipe data API sesuai docs/PRD.md (dipakai server dan client).
export type Role = "owner" | "member";
export type Room = { id: string; name: string; ownerId: string; createdAt: string };
export type Message = {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string; // ISO
};
export type RoomWithLast = Room & { lastMessage: Message | null };
export type Member = { userId: string; name: string; role: Role };

/** Cursor pesan "<ISO createdAt>_<id>" (PRD). */
export const cursorOf = (m: Pick<Message, "createdAt" | "id">) => `${m.createdAt}_${m.id}`;
