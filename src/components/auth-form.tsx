"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/** Hanya path internal, cegah open redirect lewat ?next=//evil.com atau /\evil.com */
function safeNext(next: string | null) {
  return next && /^\/(?![/\\])/.test(next) ? next : "/rooms";
}

/** Bungkus dengan <Suspense>: membaca searchParams. */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [pending, setPending] = useState(false);
  const isLogin = mode === "login";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    // shortcut: belum ada Better Auth; validasi pakai atribut HTML. Fase 1 ganti dengan authClient + Zod.
    await new Promise((r) => setTimeout(r, 400));
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
        <CardContent>
          <FieldGroup>
            {!isLogin && (
              <Field>
                <FieldLabel htmlFor="name">Nama</FieldLabel>
                <Input id="name" name="name" autoComplete="name" required maxLength={50} />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
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
