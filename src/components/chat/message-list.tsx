"use client";

import { useEffect, useRef } from "react";
import { ArrowDownIcon, RotateCwIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
  useMessageScrollerScrollable,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import type { Message as MessageData } from "@/lib/mock-api";
import { hhmm, initials } from "@/lib/utils";

export type ChatMessage = MessageData & { status?: "sending" | "failed" };

const FIVE_MIN = 5 * 60_000;

/** Pesan berturut-turut dari pengirim sama dalam 5 menit jadi satu grup. Pesan berstatus menutup grupnya. */
function groupMessages(messages: ChatMessage[]) {
  const groups: ChatMessage[][] = [];
  for (const m of messages) {
    const last = groups.at(-1);
    const prev = last?.at(-1);
    if (
      last &&
      prev &&
      !prev.status &&
      prev.userId === m.userId &&
      Date.parse(m.createdAt) - Date.parse(prev.createdAt) < FIVE_MIN
    ) {
      last.push(m);
    } else {
      groups.push([m]);
    }
  }
  return groups;
}

export function MessageList({
  messages,
  myId,
  hasMore,
  loadingOlder,
  onLoadOlder,
  onRetry,
}: {
  messages: ChatMessage[];
  myId: string;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRetry: (m: ChatMessage) => void;
}) {
  return (
    <MessageScroller className="relative min-h-0 flex-1">
      <MessageScrollerViewport aria-label="Pesan">
        <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-3 p-4">
          <MessageScrollerItem>
            <Marker variant="separator">
              {loadingOlder && (
                <MarkerIcon>
                  <Spinner />
                </MarkerIcon>
              )}
              <MarkerContent>
                {hasMore ? (loadingOlder ? "Memuat pesan lama…" : "Gulir ke atas untuk pesan lama") : messages.length ? "Awal percakapan" : "Belum ada pesan. Sapa anggota lain!"}
              </MarkerContent>
            </Marker>
          </MessageScrollerItem>

          {groupMessages(messages).map((group) => {
            const first = group[0];
            const last = group[group.length - 1];
            const mine = first.userId === myId;
            return (
              <MessageScrollerItem key={first.id} messageId={first.id}>
                <Message align={mine ? "end" : "start"}>
                  {!mine && (
                    <MessageAvatar>
                      <Avatar className="size-8">
                        <AvatarFallback>{initials(first.userName)}</AvatarFallback>
                      </Avatar>
                    </MessageAvatar>
                  )}
                  <MessageContent>
                    {!mine && (
                      <MessageHeader>
                        {first.userName} · {hhmm(first.createdAt)}
                      </MessageHeader>
                    )}
                    {/* w-full: tanpa ini grup ikut menyusut di sisi kanan dan bubble terlipat. */}
                    <BubbleGroup className="w-full">
                      {group.map((m) => (
                        <Bubble
                          key={m.id}
                          variant={mine ? (m.status === "failed" ? "destructive" : "default") : "secondary"}
                          align={mine ? "end" : "start"}
                        >
                          {/* Teks biasa, React meng-escape isinya; jangan pernah render sebagai HTML. */}
                          <BubbleContent className="whitespace-pre-wrap">{m.content}</BubbleContent>
                        </Bubble>
                      ))}
                    </BubbleGroup>
                    {mine && (
                      <MessageFooter className="gap-2">
                        {last.status === "sending" && "Mengirim…"}
                        {last.status === "failed" && (
                          <>
                            Gagal terkirim
                            <Button variant="outline" size="xs" onClick={() => onRetry(last)}>
                              <RotateCwIcon data-icon="inline-start" />
                              Coba lagi
                            </Button>
                          </>
                        )}
                        {!last.status && hhmm(last.createdAt)}
                      </MessageFooter>
                    )}
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            );
          })}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton>
        Pesan baru
        <ArrowDownIcon data-icon="inline-end" />
      </MessageScrollerButton>
      <LoadOlderAtTop enabled={hasMore && !loadingOlder} onLoad={onLoadOlder} />
    </MessageScroller>
  );
}

/** Muat halaman lama saat user menyentuh puncak. Ditahan sampai viewport pernah turun dari atas,
 * supaya posisi awal (sebelum scroll ke bawah otomatis) tidak memicu muat beruntun. */
function LoadOlderAtTop({ enabled, onLoad }: { enabled: boolean; onLoad: () => void }) {
  const { start: canScrollUp } = useMessageScrollerScrollable();
  const armed = useRef(false);

  useEffect(() => {
    if (canScrollUp) armed.current = true;
    else if (armed.current && enabled) onLoad();
  }, [canScrollUp, enabled, onLoad]);

  return null;
}
