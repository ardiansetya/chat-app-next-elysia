"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

const errorText: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Email atau password salah.",
  USER_ALREADY_EXISTS: "Email sudah terdaftar.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Email sudah terdaftar.",
  PASSWORD_TOO_SHORT: "Password minimal 8 karakter.",
};

/** Hanya path internal, cegah open redirect lewat ?next=//evil.com atau /\evil.com */
function safeNext(next: string | null) {
  return next && /^\/(?![/\\])/.test(next) ? next : "/rooms";
}

/** Bungkus dengan <Suspense>: membaca searchParams. */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLogin = mode === "login";
  // id unik: Next 16 menyimpan halaman login/register sebelumnya tersembunyi di DOM, id statis jadi bentrok.
  const id = useId();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setPending(true);
    setError(null);
    // Validasi bentuk input lewat atribut HTML (required, type=email, minLength); server Better Auth tetap memvalidasi ulang.
    const { error } = isLogin
      ? await authClient.signIn.email({ email, password })
      : await authClient.signUp.email({ name: String(form.get("name")).trim(), email, password });
    if (error) {
      setError((error.code && errorText[error.code]) || error.message || "Terjadi kesalahan, coba lagi.");
      setPending(false);
      return;
    }
    router.push(next);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{isLogin ? "Masuk" : "Buat akun"}</CardTitle>
        <CardDescription>
          {isLogin ? "Masuk untuk melanjutkan obrolan." : "Daftar untuk mulai membuat room."}
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive" role="alert">
              <CircleAlertIcon />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
          <FieldGroup>
            {!isLogin && (
              <Field>
                <FieldLabel htmlFor={`${id}-name`}>Nama</FieldLabel>
                <Input id={`${id}-name`} name="name" autoComplete="name" required maxLength={50} />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor={`${id}-email`}>Email</FieldLabel>
              <Input id={`${id}-email`} name="email" type="email" autoComplete="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-password`}>Password</FieldLabel>
              <Input
                id={`${id}-password`}
                name="password"
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                minLength={8}
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {isLogin ? "Masuk" : "Daftar"}
          </Button>
          <p className="text-sm text-muted-foreground">
            {isLogin ? "Belum punya akun? " : "Sudah punya akun? "}
            <Link
              href={isLogin ? `/register?next=${encodeURIComponent(next)}` : `/login?next=${encodeURIComponent(next)}`}
              className="text-foreground underline underline-offset-4"
            >
              {isLogin ? "Daftar" : "Masuk"}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
