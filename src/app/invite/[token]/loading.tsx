import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Skeleton className="h-48 w-full max-w-sm rounded-xl" />
    </main>
  );
}
