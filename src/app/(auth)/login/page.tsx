import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoginPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-sm rounded-xl" />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
