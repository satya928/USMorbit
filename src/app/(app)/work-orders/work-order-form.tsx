"use client";

import { useState } from "react";
import { Field, Input, Select, ServerForm, SubmitButton, Textarea } from "@/components/forms";
import type { ActionResult } from "@/lib/errors";

type Option = { id: string; name: string };
export type WorkOrderFormValues = {
  id?: string;
  title?: string;
  description?: string | null;
  siteId?: string;
  assetId?: string | null;
  categoryId?: string | null;
  locationText?: string | null;
  priority?: string;
  dueAt?: string;
  estimatedCost?: string | null;
  actualCost?: string | null;
  clientVisibleSummary?: string | null;
  internalNotes?: string | null;
  checklist?: string;
  sourceInspectionId?: string;
};

export function WorkOrderForm({
  action,
  values = {},
  sites,
  assets,
  categories,
  privileged,
  mode,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  values?: WorkOrderFormValues;
  sites: (Option & { timezone: string })[];
  assets: (Option & { code: string; siteId: string })[];
  categories: (Option & { requiredCredential: string | null })[];
  privileged: boolean;
  mode: "create" | "edit";
}) {
  const [siteId, setSiteId] = useState(values.siteId ?? (sites.length === 1 ? sites[0].id : ""));
  const siteAssets = assets.filter((a) => a.siteId === siteId);
  const tz = sites.find((s) => s.id === siteId)?.timezone;
  return (
    <ServerForm action={action} className="space-y-5" warnUnsaved>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      {values.sourceInspectionId && <input type="hidden" name="sourceInspectionId" value={values.sourceInspectionId} />}
      <Field label="Title" name="title" required>
        <Input name="title" defaultValue={values.title} required minLength={3} maxLength={200} placeholder="e.g. Air conditioning not cooling in Room 421" />
      </Field>
      <Field label="Description" name="description">
        <Textarea name="description" defaultValue={values.description ?? ""} rows={4} placeholder="What is happening, since when, and any safety concerns" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Site" name="siteId" required>
          <Select name="siteId" value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
            <option value="">Select a site…</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Asset" name="assetId" hint={siteId ? `${siteAssets.length} asset(s) at this site` : "Select a site first"}>
          <Select name="assetId" defaultValue={values.assetId ?? ""} key={siteId} disabled={!siteId}>
            <option value="">No specific asset</option>
            {siteAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Exact location" name="locationText">
          <Input name="locationText" defaultValue={values.locationText ?? ""} placeholder="Level, room, zone" />
        </Field>
        <Field label="Category" name="categoryId" hint="Some categories require a credential to be assigned.">
          <Select name="categoryId" defaultValue={values.categoryId ?? ""}>
            <option value="">Uncategorised</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.requiredCredential ? ` (requires ${c.requiredCredential})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority" name="priority" required>
          <Select name="priority" defaultValue={values.priority ?? "medium"}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </Field>
        {privileged && (
          <Field label="SLA due" name="dueAt" hint={mode === "create" ? `Leave blank to apply the SLA preset for the priority.${tz ? ` Site time (${tz}).` : ""}` : tz ? `Site time (${tz}).` : undefined}>
            <Input name="dueAt" type="datetime-local" defaultValue={values.dueAt} />
          </Field>
        )}
      </div>
      {mode === "create" && (
        <Field label="Checklist" name="checklist" hint="One item per line. Leave blank to use the workspace default checklist.">
          <Textarea name="checklist" defaultValue={values.checklist} rows={3} placeholder={"Isolate power\nReplace fitting\nTest and clean up"} />
        </Field>
      )}
      {privileged && (
        <details className="rounded-md border border-slate-200 p-3" open={mode === "edit"}>
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Costs, client summary and internal notes</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Estimated cost" name="estimatedCost">
              <Input name="estimatedCost" type="number" min={0} step="0.01" defaultValue={values.estimatedCost ?? ""} />
            </Field>
            {mode === "edit" && (
              <Field label="Actual cost" name="actualCost">
                <Input name="actualCost" type="number" min={0} step="0.01" defaultValue={values.actualCost ?? ""} />
              </Field>
            )}
            <Field label="Client-visible summary" name="clientVisibleSummary" className="sm:col-span-2" hint="Shown to client approvers.">
              <Textarea name="clientVisibleSummary" defaultValue={values.clientVisibleSummary ?? ""} />
            </Field>
            <Field label="Internal notes" name="internalNotes" className="sm:col-span-2" hint="Never shown to client approvers or contractors.">
              <Textarea name="internalNotes" defaultValue={values.internalNotes ?? ""} />
            </Field>
          </div>
        </details>
      )}
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">{mode === "create" ? (privileged ? "Create work order" : "Submit request") : "Save changes"}</SubmitButton>
      </div>
    </ServerForm>
  );
}
