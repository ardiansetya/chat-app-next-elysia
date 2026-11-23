"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { acceptInvite, getInvite } from "@/lib/mock-api";
import { initials } from "@/lib/utils";

export function InviteCard({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<{ roomName: string } | null | undefined>(undefined);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    getInvite(token).then(setInvite);
  }, [token]);

  async function join() {
    setPending(true);
    const { roomId } = await acceptInvite(token);
    router.push(`/rooms/${roomId}`);
  }

  if (invite === undefined) return <Skeleton className="h-48 w-full max-w-sm rounded-xl" />;

  if (invite === null)
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Undangan tidak berlaku</CardTitle>
          <CardDescription>Link ini salah atau sudah kedaluwarsa. Minta link baru ke pemilik room.</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" className="w-full" nativeButton={false} render={<Link href="/rooms" />}>
            Ke daftar room
          </Button>
        </CardFooter>
      </Card>
    );

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="flex flex-col items-center gap-3 text-center">
        <Avatar className="size-14">
          <AvatarFallback>{initials(invite.roomName)}</AvatarFallback>
        </Avatar>
        <CardTitle>{invite.roomName}</CardTitle>
        <CardDescription>Kamu diundang bergabung ke room ini.</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button className="w-full" onClick={join} disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          Gabung
        </Button>
      </CardFooter>
    </Card>
  );
}
