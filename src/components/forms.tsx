"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/errors";
import { buttonClass, cn, Notice, type ButtonVariant } from "./ui";

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
const FieldErrors = createContext<Record<string, string>>({});

/**
 * Progressive-enhancement form around a server action. Shows a summary error, per-field errors,
 * a success message, and blocks double submits via the pending state.
 */
export function ServerForm({
  action,
  children,
  className,
  successMessage,
  resetOnSuccess,
  onSuccess,
  warnUnsaved,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (r: ActionResult) => void;
  warnUnsaved?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      setDirty(false);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (!warnUnsaved || !dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [warnUnsaved, dirty]);

  const fieldErrors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <FieldErrors.Provider value={fieldErrors}>
      <form ref={ref} action={formAction} className={className} onChange={() => warnUnsaved && setDirty(true)} noValidate={false}>
        {state && !state.ok && (
          <div className="mb-3">
            <Notice tone={state.code === "FORBIDDEN" ? "warn" : "error"}>{state.error}</Notice>
          </div>
        )}
        {state?.ok && (successMessage || state.message) && (
          <div className="mb-3">
            <Notice tone="success">{state.message ?? successMessage}</Notice>
          </div>
        )}
        {children}
      </form>
    </FieldErrors.Provider>
  );
}

export function useFieldError(name: string) {
  return useContext(FieldErrors)[name];
}

export function Field({ label, name, hint, children, className, required }: { label: string; name: string; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  const error = useFieldError(name);
  return (
    <div className={className}>
      <label htmlFor={`f-${name}`} className="label">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`f-${name}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ name, className, ...props }: ComponentProps<"input"> & { name: string }) {
  const error = useFieldError(name);
  return <input id={`f-${name}`} name={name} aria-invalid={!!error} aria-describedby={error ? `f-${name}-error` : undefined} className={cn("input", className)} {...props} />;
}

export function Textarea({ name, className, ...props }: ComponentProps<"textarea"> & { name: string }) {
  const error = useFieldError(name);
  return <textarea id={`f-${name}`} name={name} aria-invalid={!!error} rows={3} className={cn("input", className)} {...props} />;
}

export function Select({ name, className, children, ...props }: ComponentProps<"select"> & { name: string }) {
  const error = useFieldError(name);
  return (
    <select id={`f-${name}`} name={name} aria-invalid={!!error} className={cn("input", className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ name, label, ...props }: ComponentProps<"input"> & { name: string; label: ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" name={name} className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingLabel, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md"; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

/** Inline action button with an optional reason prompt (used for workflow transitions). */
export function ActionButton({
  action,
  label,
  fields,
  variant = "secondary",
  reasonLabel,
  reasonRequired,
  confirm,
}: {
  action: Action;
  label: string;
  fields: Record<string, string>;
  variant?: ButtonVariant;
  reasonLabel?: string;
  reasonRequired?: boolean;
  confirm?: string;
}) {
  const [open, setOpen] = useState(false);
  if (reasonLabel) {
    return open ? (
      <div className="w-full rounded-md border border-slate-200 bg-slate-50 p-3">
        <ServerForm action={action} onSuccess={() => setOpen(false)}>
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <Field label={reasonLabel} name="reason" required={reasonRequired}>
            <Textarea name="reason" required={reasonRequired} autoFocus placeholder="Explain what needs to change…" />
          </Field>
          <div className="mt-2 flex gap-2">
            <SubmitButton variant={variant} size="sm">
              {label}
            </SubmitButton>
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </ServerForm>
      </div>
    ) : (
      <button type="button" className={buttonClass(variant, "md")} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <ServerForm action={action}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} onClick={(e) => confirm && !window.confirm(confirm) && e.preventDefault()}>
        {label}
      </SubmitButton>
    </ServerForm>
  );
}
