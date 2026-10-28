"use client";

import { Field, Input, ServerForm, SubmitButton } from "@/components/forms";
import { signInAction } from "../auth-actions";

export function SignInForm({ next }: { next?: string }) {
  return (
    <ServerForm action={signInAction} className="mt-4 space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" name="email">
        <Input name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password" name="password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
      <p className="text-xs text-slate-500">Forgot your password? Ask your workspace administrator to reset it.</p>
    </ServerForm>
  );
}
