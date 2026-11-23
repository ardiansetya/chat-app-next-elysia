"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
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
import {
  createInvite,
  getMembers,
  getMessages,
  getRoom,
  me,
  removeMember,
  sendMessage,
  type Member,
  type Role,
  type Room,
} from "@/lib/mock-api";
import { initials } from "@/lib/utils";

// shortcut: status online browser sebagai pengganti error EventSource; Fase 4 ganti dengan onerror/onopen SSE.
const subscribeOnline = (cb: () => void) => {
  addEventListener("online", cb);
  addEventListener("offline", cb);
  return () => {
    removeEventListener("online", cb);
    removeEventListener("offline", cb);
  };
};

export function ChatRoom({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<(Room & { role: Role }) | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  useEffect(() => {
    getRoom(roomId).then((r) => {
      setRoom(r);
      if (!r) return;
      getMembers(roomId).then(setMembers);
      getMessages(roomId, null).then(({ items, nextCursor }) => {
        setMessages(items.reverse());
        setCursor(nextCursor);
      });
    });
  }, [roomId]);

  const loadOlder = useCallback(async () => {
    if (!cursor) return;
    setLoadingOlder(true);
    const { items, nextCursor } = await getMessages(roomId, cursor);
    setMessages((prev) => {
      const seen = new Set(prev?.map((m) => m.id));
      return [...items.reverse().filter((m) => !seen.has(m.id)), ...(prev ?? [])];
    });
    setCursor(nextCursor);
    setLoadingOlder(false);
  }, [roomId, cursor]);

  if (room === undefined) return <ChatSkeleton />;
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

  return (
    <MessageScrollerProvider autoScroll>
      <ChatHeader
        room={room}
        members={members}
        onRemove={async (userId) => {
          await removeMember(room.id, userId);
          setMembers(await getMembers(room.id));
        }}
      />
      <ReconnectBanner />
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

  async function send(content: string, retryId?: string) {
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
    try {
      const saved = await sendMessage(roomId, content);
      setMessages((prev) => (prev ?? []).map((m) => (m.id === tempId ? saved : m)));
    } catch {
      setMessages((prev) => (prev ?? []).map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
      // Fase 5: bedakan 429 -> "Terlalu cepat, tunggu sebentar".
      toast.add({ title: "Pesan gagal dikirim", type: "error" });
    }
  }
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

function ReconnectBanner() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <Alert variant="warning" className="rounded-none border-x-0 border-t-0">
      <WifiOffIcon />
      <AlertTitle>Menyambungkan kembali…</AlertTitle>
    </Alert>
  );
}

function ChatHeader({
  room,
  members,
  onRemove,
}: {
  room: Room & { role: Role };
  members: Member[];
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
            <DropdownMenuItem onClick={() => setOpen("members")}>
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
                  {m.userId === me.id && " (kamu)"}
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

      <InviteDialog roomId={room.id} open={open === "invite"} onOpenChange={(o) => setOpen(o ? "invite" : null)} />
    </header>
  );
}

function InviteDialog({
  roomId,
  open,
  onOpenChange,
}: {
  roomId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <InviteLink roomId={roomId} />
      </DialogContent>
    </Dialog>
  );
}

/** Ter-mount hanya saat dialog terbuka, jadi setiap buka membuat link baru. */
function InviteLink({ roomId }: { roomId: string }) {
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);

  useEffect(() => {
    createInvite(roomId).then(setInvite);
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
