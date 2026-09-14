"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signInAction, type LoginState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          Memproses…
        </>
      ) : (
        "Masuk"
      )}
    </Button>
  );
}

export function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError: string | null;
}) {
  const [state, formAction] = useActionState<LoginState, FormData>(signInAction, {
    error: initialError,
  });

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Nama pengguna</Label>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Kata sandi</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {state.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{state.error}</span>
            </p>
          ) : null}

          <SubmitButton />

          <p className="text-center text-xs text-muted-foreground text-balance">
            Lupa kata sandi? Hubungi administrator — tidak ada pemulihan mandiri
            melalui email.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
