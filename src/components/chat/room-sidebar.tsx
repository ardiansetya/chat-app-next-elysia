"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOutIcon, MessagesSquareIcon, PlusIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { createRoom, getRooms, me, type RoomWithLast } from "@/lib/mock-api";
import { cn, hhmm, initials } from "@/lib/utils";

export function RoomSidebar({ className }: { className?: string }) {
  const { id: activeId } = useParams<{ id?: string }>();
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomWithLast[] | null>(null);

  useEffect(() => {
    getRooms().then(setRooms);
  }, []);

  const onCreated = (room: { id: string }) => {
    getRooms().then(setRooms);
    router.push(`/rooms/${room.id}`);
  };

  return (
    <aside className={cn("flex min-h-0 flex-col border-r", className)}>
      <header className="flex items-center justify-between gap-2 border-b p-3">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" className="h-auto min-w-0 gap-2 px-1.5 py-1" />}>
            <Avatar className="size-7">
              <AvatarFallback>{initials(me.name)}</AvatarFallback>
            </Avatar>
            <span className="truncate font-medium">{me.name}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{me.email}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => router.push("/login")}>
                <LogOutIcon />
                Keluar
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <NewRoomDialog onCreated={onCreated} />
      </header>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Daftar room">
        {rooms === null ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))
        ) : rooms.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessagesSquareIcon />
              </EmptyMedia>
              <EmptyTitle>Belum ada room</EmptyTitle>
              <EmptyDescription>Buat room lalu undang teman lewat link.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <NewRoomDialog onCreated={onCreated} label="Buat room" />
            </EmptyContent>
          </Empty>
        ) : (
          rooms.map((room) => (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
              aria-current={room.id === activeId ? "page" : undefined}
              className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted aria-[current=page]:bg-muted"
            >
              <Avatar className="size-9">
                <AvatarFallback>{initials(room.name)}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{room.name}</span>
                  {room.lastMessage && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {hhmm(room.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {room.lastMessage
                    ? `${room.lastMessage.userName}: ${room.lastMessage.content}`
                    : "Belum ada pesan"}
                </span>
              </div>
            </Link>
          ))
        )}
      </nav>
    </aside>
  );
}

function NewRoomDialog({
  onCreated,
  label,
}: {
  onCreated: (room: { id: string }) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name")).trim();
    if (!name) return;
    setPending(true);
    const room = await createRoom(name);
    setPending(false);
    setOpen(false);
    onCreated(room);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={label ? <Button /> : <Button variant="outline" size="icon" aria-label="Room baru" />}
      >
        <PlusIcon data-icon={label ? "inline-start" : undefined} />
        {label}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Room baru</DialogTitle>
            <DialogDescription>Kamu akan menjadi pemilik room ini.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="room-name">Nama room</FieldLabel>
            <Input id="room-name" name="name" required minLength={1} maxLength={50} autoFocus />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Buat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
