import { Suspense } from "react";
import { RoomSidebar } from "@/components/chat/room-sidebar";

const sidebarClass = "hidden w-80 shrink-0 md:flex";

export default function RoomsLayout({ children }: LayoutProps<"/rooms">) {
  return (
    <div className="flex h-dvh min-h-0">
      {/* Suspense wajib: sidebar membaca useParams (data URL runtime) di bawah Cache Components. */}
      <Suspense fallback={<aside className={`${sidebarClass} border-r`} />}>
        <RoomSidebar className={sidebarClass} />
      </Suspense>
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
