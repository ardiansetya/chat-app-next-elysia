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
