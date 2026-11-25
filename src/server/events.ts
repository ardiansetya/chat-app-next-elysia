import { redis } from "@/lib/redis";
import type { Message } from "@/lib/types";

/** Pesan baru, atau sinyal bahwa seorang anggota dikeluarkan (stream miliknya harus ditutup). */
export type RoomEvent = Message | { removedUserId: string };

const channel = (roomId: string) => `room:${roomId}`;

export async function publishMessage(message: Message) {
  await redis.publish(channel(message.roomId), message);
}

export async function publishRemoval(roomId: string, userId: string) {
  await redis.publish(channel(roomId), { removedUserId: userId });
}

/** Subscribe ke channel room; resolve setelah Upstash mengonfirmasi langganan. */
export async function subscribeRoom(roomId: string, onEvent: (e: RoomEvent) => void) {
  const sub = redis.subscribe<RoomEvent>(channel(roomId));
  sub.on("message", ({ message }) => onEvent(message));
  await new Promise<void>((resolve, reject) => {
    sub.on("subscribe", () => resolve());
    sub.on("error", reject);
  });
  return () => sub.unsubscribe();
}
