import { InviteCard } from "@/components/invite-card";

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <InviteCard token={token} />
    </main>
  );
}
