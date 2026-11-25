"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, CopyIcon, EllipsisVerticalIcon, UserMinusIcon, UserPlusIcon, UsersIcon, WifiOffIcon } from "lucide-react";
import { MessageInput } from "@/components/chat/message-input";
import { MessageList, type ChatMessage } from "@/components/chat/message-list";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { MessageScrollerProvider, useMessageScroller } from "@/components/ui/message-scroller";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { cursorOf, type Member, type Message, type Role, type Room } from "@/lib/types";
import { initials } from "@/lib/utils";

type RoomDetail = Room & { role: Role };

// Room kosong: stream tetap diberi cursor supaya pesan yang masuk sebelum stream tersambung ikut terkirim.
const EPOCH_CURSOR = `${new Date(0).toISOString()}_00000000-0000-0000-0000-000000000000`;

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byCursor = (a: Message, b: Message) => cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id);

/** Gabungkan pesan dari SSE: abaikan duplikat (id sama), gantikan versi "mengirim" milik sendiri. */
export function mergeIncoming(prev: ChatMessage[], m: Message): ChatMessage[] {
  if (prev.some((x) => x.id === m.id)) return prev;
  const temp = prev.findIndex((x) => x.status === "sending" && x.userId === m.userId && x.content === m.content);
  const rest = temp >= 0 ? prev.filter((_, i) => i !== temp) : prev;
  return [...rest, m].sort(byCursor);
}

export function ChatRoom({ roomId }: { roomId: string }) {
  const me = authClient.useSession().data?.user;
  const [room, setRoom] = useState<RoomDetail | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [streamFrom, setStreamFrom] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);

  const memberIds = useRef(new Set<string>());
  const loadMembers = useCallback(async () => {
    const { data } = await api.rooms({ id: roomId }).members.get();
    if (!data) return;
    memberIds.current = new Set(data.map((m) => m.userId));
    setMembers(data);
  }, [roomId]);

  useEffect(() => {
    const r = api.rooms({ id: roomId });
    r.get().then(({ data }) => {
      setRoom(data ?? null);
      if (!data) return;
      loadMembers();
      r.messages.get().then(({ data, error }) => {
        if (!data) return void toast.add({ title: errorMessage(error, "Gagal memuat pesan"), type: "error" });
        setMessages([...data.items].reverse());
        setCursor(data.nextCursor);
        setStreamFrom(data.items[0] ? cursorOf(data.items[0]) : EPOCH_CURSOR);
      });
    });
  }, [roomId, loadMembers]);

  // Real-time: EventSource reconnect sendiri dengan header Last-Event-ID; server mengirim pesan yang terlewat.
  useEffect(() => {
    if (!streamFrom) return;
    const es = new EventSource(`/api/rooms/${roomId}/stream?after=${encodeURIComponent(streamFrom)}`);
    es.onopen = () => setReconnecting(false);
    es.onerror = () => {
      setReconnecting(true);
      if (es.readyState !== EventSource.CLOSED) return;
      // Ditutup permanen (respons bukan 200), mis. 403 setelah dikeluarkan dari room.
      api.rooms({ id: roomId }).get().then(({ error }) => {
        if (error?.status === 403) setRoom(null);
        else setTimeout(() => setStreamKey((k) => k + 1), 3000);
      });
    };
    es.addEventListener("message", (e) => {
      const m = JSON.parse(e.data) as Message;
      setMessages((prev) => prev && mergeIncoming(prev, m));
      // Pengirim belum dikenal = anggota baru bergabung; segarkan jumlah & daftar anggota.
      if (!memberIds.current.has(m.userId)) loadMembers();
    });
    return () => es.close();
  }, [roomId, streamFrom, streamKey, loadMembers]);

  const loadOlder = useCallback(async () => {
    if (!cursor) return;
    setLoadingOlder(true);
    const { data, error } = await api.rooms({ id: roomId }).messages.get({ query: { cursor } });
    setLoadingOlder(false);
    if (!data) return void toast.add({ title: errorMessage(error, "Gagal memuat pesan lama"), type: "error" });
    setMessages((prev) => {
      const seen = new Set(prev?.map((m) => m.id));
      return [...[...data.items].reverse().filter((m) => !seen.has(m.id)), ...(prev ?? [])];
    });
    setCursor(data.nextCursor);
  }, [roomId, cursor]);

  if (room === undefined || !me) return <ChatSkeleton />;
  if (room === null)
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyTitle>Room tidak tersedia</EmptyTitle>
          <EmptyDescription>Room tidak ditemukan atau kamu bukan anggotanya.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" nativeButton={false} render={<Link href="/rooms" />}>
            Kembali ke daftar room
          </Button>
        </EmptyContent>
      </Empty>
    );

  async function send(content: string, retryId?: string) {
    if (!me) return;
    const tempId = retryId ?? crypto.randomUUID();
    const temp: ChatMessage = {
      id: tempId,
      roomId,
      userId: me.id,
      userName: me.name,
      content,
      createdAt: new Date().toISOString(),
      status: "sending",
    };
    setMessages((prev) => (retryId ? (prev ?? []).map((m) => (m.id === retryId ? temp : m)) : [...(prev ?? []), temp]));

    const res = await api.rooms({ id: roomId }).messages.post({ content }).catch(() => null);
    const saved = res?.data;
    if (saved) {
      // Kalau SSE sudah lebih dulu mengantar pesan ini, cukup buang versi sementaranya.
      setMessages((prev) =>
        prev && (prev.some((m) => m.id === saved.id) ? prev.filter((m) => m.id !== tempId) : prev.map((m) => (m.id === tempId ? saved : m))),
      );
      return;
    }
    setMessages((prev) => prev && prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
    toast.add({
      title: res?.error?.status === 429 ? "Terlalu cepat, tunggu sebentar" : errorMessage(res?.error, "Pesan gagal dikirim"),
      type: "error",
    });
  }

  return (
    <MessageScrollerProvider autoScroll>
      <ChatHeader
        room={room}
        members={members}
        myId={me.id}
        onOpenMembers={loadMembers}
        onRemove={async (userId) => {
          const { error } = await api.rooms({ id: room.id }).members({ userId }).delete();
          if (error) toast.add({ title: errorMessage(error, "Gagal mengeluarkan anggota"), type: "error" });
          await loadMembers();
        }}
      />
      {reconnecting && (
        <Alert variant="warning" className="rounded-none border-x-0 border-t-0">
          <WifiOffIcon />
          <AlertTitle>Menyambungkan kembali…</AlertTitle>
        </Alert>
      )}
      {messages === null ? (
        <MessagesSkeleton />
      ) : (
        <MessageList
          messages={messages}
          myId={me.id}
          hasMore={cursor !== null}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlder}
          onRetry={(m) => send(m.content, m.id)}
        />
      )}
      <Composer onSend={(content) => send(content)} />
    </MessageScrollerProvider>
  );
}

/** Input di dalam provider supaya bisa melompat ke pesan terbaru setelah mengirim. */
function Composer({ onSend }: { onSend: (content: string) => void }) {
  const { scrollToEnd } = useMessageScroller();
  return (
    <MessageInput
      onSend={(content) => {
        onSend(content);
        requestAnimationFrame(() => scrollToEnd({ behavior: "smooth" }));
      }}
    />
  );
}

function ChatHeader({
  room,
  members,
  myId,
  onOpenMembers,
  onRemove,
}: {
  room: RoomDetail;
  members: Member[];
  myId: string;
  onOpenMembers: () => void;
  onRemove: (userId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState<"members" | "invite" | null>(null);
  const isOwner = room.role === "owner";

  return (
    <header className="flex items-center gap-2 border-b p-3">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Kembali"
        nativeButton={false}
        render={<Link href="/rooms" />}
      >
        <ArrowLeftIcon />
      </Button>
      <Avatar className="size-9">
        <AvatarFallback>{initials(room.name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate text-sm font-semibold">{room.name}</h1>
        <span className="text-xs text-muted-foreground">{members.length || "…"} anggota</span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Menu room" />}>
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setOpen("members");
                onOpenMembers();
              }}
            >
              <UsersIcon />
              Anggota
            </DropdownMenuItem>
            {isOwner && (
              <DropdownMenuItem onClick={() => setOpen("invite")}>
                <UserPlusIcon />
                Undang
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={open === "members"} onOpenChange={(o) => setOpen(o ? "members" : null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Anggota</SheetTitle>
            <SheetDescription>{members.length} orang di room ini.</SheetDescription>
          </SheetHeader>
          <ul className="flex flex-col gap-1 px-4">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-2">
                <Avatar className="size-8">
                  <AvatarFallback>{initials(m.name)}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-sm">
                  {m.name}
                  {m.userId === myId && " (kamu)"}
                </span>
                {m.role === "owner" && <Badge variant="secondary">Pemilik</Badge>}
                {isOwner && m.role !== "owner" && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Keluarkan ${m.name}`} onClick={() => onRemove(m.userId)}>
                    <UserMinusIcon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      <Dialog open={open === "invite"} onOpenChange={(o) => setOpen(o ? "invite" : null)}>
        <DialogContent>
          <InviteLink roomId={room.id} />
        </DialogContent>
      </Dialog>
    </header>
  );
}

/** Ter-mount hanya saat dialog terbuka, jadi setiap buka membuat link baru. */
function InviteLink({ roomId }: { roomId: string }) {
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);

  useEffect(() => {
    api.rooms({ id: roomId }).invites.post().then(({ data, error }) => {
      if (data) setInvite(data);
      else toast.add({ title: errorMessage(error, "Gagal membuat link undangan"), type: "error" });
    });
  }, [roomId]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Undang anggota</DialogTitle>
        <DialogDescription>
          {invite
            ? `Bagikan link ini. Berlaku sampai ${new Date(invite.expiresAt).toLocaleDateString("id-ID", { dateStyle: "long" })}.`
            : "Membuat link undangan…"}
        </DialogDescription>
      </DialogHeader>
      {invite ? (
        <InputGroup>
          <InputGroupInput readOnly value={invite.url} aria-label="Link undangan" onFocus={(e) => e.target.select()} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              onClick={async () => {
                await navigator.clipboard.writeText(invite.url);
                toast.add({ title: "Link undangan disalin", type: "success" });
              }}
            >
              <CopyIcon data-icon="inline-start" />
              Salin
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Skeleton className="h-8 w-full" />
      )}
    </>
  );
}

export function ChatSkeleton() {
  return (
    <>
      <div className="flex items-center gap-3 border-b p-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <MessagesSkeleton />
    </>
  );
}

function MessagesSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-end gap-4 p-4">
      {[48, 64, 40, 56, 36].map((w, i) => (
        <Skeleton key={i} className={i % 2 ? "h-9 self-end" : "h-9"} style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
