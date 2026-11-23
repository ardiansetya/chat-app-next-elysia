import { Suspense } from "react";
import { MessagesSquareIcon } from "lucide-react";
import { RoomSidebar } from "@/components/chat/room-sidebar";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function RoomsPage() {
  return (
    <>
      {/* Mobile: daftar room penuh. Desktop: sidebar ada di layout, di sini panel kosong. */}
      <Suspense fallback={<div className="flex-1 md:hidden" />}>
        <RoomSidebar className="flex-1 border-r-0 md:hidden" />
      </Suspense>
      <Empty className="hidden flex-1 md:flex">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessagesSquareIcon />
          </EmptyMedia>
          <EmptyTitle>Pilih room</EmptyTitle>
          <EmptyDescription>Pilih room di samping untuk mulai mengobrol.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
