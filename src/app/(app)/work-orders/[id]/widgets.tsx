"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Checkbox, Field, Input, Select, ServerForm, SubmitButton, Textarea } from "@/components/forms";
import { cn } from "@/components/ui";
import { addChecklistAction, assignAction, checklistToggleAction, commentAction } from "../actions";

type Person = { id: string; name: string; personType: string; contractorId: string | null; credential: { ok: true } | { ok: false; reason: string } };

export function AssignForm({ id, people, contractors, current, enforce, canOverride }: { id: string; people: Person[]; contractors: { id: string; name: string }[]; current: { personId: string | null; contractorId: string | null }; enforce: boolean; canOverride: boolean }) {
  const [personId, setPersonId] = useState(current.personId ?? "");
  const selected = people.find((p) => p.id === personId);
  const blocked = enforce && selected && !selected.credential.ok;
  return (
    <ServerForm action={assignAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <Field label="Person" name="personId">
        <Select name="personId" value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">— No individual —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {enforce && !p.credential.ok ? " ⚠ credential issue" : ""}
            </option>
          ))}
        </Select>
      </Field>
      {selected && (
        <p className={cn("flex items-start gap-1.5 text-xs", selected.credential.ok ? "text-green-700" : "text-amber-800")}>
          {selected.credential.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
          {selected.credential.ok ? "Eligible for this category." : selected.credential.reason}
        </p>
      )}
      <Field label="Contractor" name="contractorId" hint="Defaults to the person's company when they are a contractor.">
        <Select name="contractorId" defaultValue={current.contractorId ?? ""}>
          <option value="">— In-house —</option>
          {contractors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      {blocked && (
        <Field label="Override reason" name="overrideReason" hint={canOverride ? "Overrides are recorded in the audit log." : "Your role cannot override this rule — choose another person."}>
          <Textarea name="overrideReason" disabled={!canOverride} required={canOverride} placeholder="Why is this assignment acceptable?" />
        </Field>
      )}
      <SubmitButton size="sm" disabled={!!blocked && !canOverride}>
        {current.personId || current.contractorId ? "Reassign" : "Assign"}
      </SubmitButton>
    </ServerForm>
  );
}

export function ChecklistItem({ id, item, editable }: { id: string; item: { id: string; label: string; done: boolean; required: boolean; completedAt: Date | null }; editable: boolean }) {
  // Optimistic: reflect the click immediately, then re-sync from the server's refreshed props.
  const [done, setDone] = useState(item.done);
  useEffect(() => setDone(item.done), [item.done]);
  return (
    <ServerForm action={checklistToggleAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="done" value={String(!item.done)} />
      <label className={cn("flex items-start gap-2.5 rounded-md px-2 py-1.5", editable && "cursor-pointer hover:bg-slate-50")}>
        <input
          type="checkbox"
          checked={done}
          disabled={!editable}
          onChange={(e) => {
            setDone(e.currentTarget.checked);
            e.currentTarget.form?.requestSubmit();
          }}
          className="mt-0.5 size-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
        />
        <span className={cn("text-sm", done ? "text-slate-500 line-through" : "text-slate-800")}>
          {item.label}
          {item.required && !done && <span className="ml-1 text-xs text-red-600">required</span>}
        </span>
      </label>
    </ServerForm>
  );
}

export function AddChecklistItem({ id }: { id: string }) {
  return (
    <ServerForm action={addChecklistAction} resetOnSuccess className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="min-w-48 flex-1">
        <Input name="label" placeholder="Add checklist item" aria-label="New checklist item" required maxLength={300} />
      </div>
      <Checkbox name="required" label="Required" defaultChecked />
      <SubmitButton size="sm" variant="secondary">
        Add
      </SubmitButton>
    </ServerForm>
  );
}

export function CommentForm({ id, canInternal }: { id: string; canInternal: boolean }) {
  return (
    <ServerForm action={commentAction} resetOnSuccess className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Field label="Add a comment" name="body">
        <Textarea name="body" required maxLength={4000} placeholder="Update, question or note…" />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {canInternal ? <Checkbox name="internal" label="Internal note (hidden from clients and contractors)" /> : <span />}
        <SubmitButton size="sm">Post</SubmitButton>
      </div>
    </ServerForm>
  );
}
