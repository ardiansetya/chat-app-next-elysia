"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { initials } from "@/lib/utils";

export function InviteCard({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<{ roomName: string } | { error: string } | undefined>(undefined);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api
      .invites({ token })
      .get()
      .then(({ data, error }) => setInvite(data ?? { error: errorMessage(error, "Link ini tidak berlaku.") }));
  }, [token]);

  async function join() {
    setPending(true);
    const { data, error } = await api.invites({ token }).accept.post();
    if (data) return router.push(`/rooms/${data.roomId}`);
    setPending(false);
    toast.add({ title: errorMessage(error, "Gagal bergabung"), type: "error" });
  }

  if (invite === undefined) return <Skeleton className="h-48 w-full max-w-sm rounded-xl" />;

  if ("error" in invite)
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Undangan tidak berlaku</CardTitle>
          <CardDescription>{invite.error} Minta link baru ke pemilik room.</CardDescription>
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
