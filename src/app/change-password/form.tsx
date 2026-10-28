"use client";

import { Field, Input, ServerForm, SubmitButton } from "@/components/forms";
import { changePasswordAction } from "../auth-actions";

export function ChangePasswordForm() {
  return (
    <ServerForm action={changePasswordAction} className="space-y-4">
      <Field label="Current password" name="current">
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" name="next">
        <Input name="next" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirm new password" name="confirm">
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton>Update password</SubmitButton>
    </ServerForm>
  );
}
