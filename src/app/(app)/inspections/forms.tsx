"use client";

import { useState } from "react";
import { Field, Input, Select, ServerForm, SubmitButton, Textarea } from "@/components/forms";
import { buttonClass, cn } from "@/components/ui";
import { addDefectAction, answersAction, createTemplateAction, startRunAction } from "./actions";

type Item = { id: string; prompt: string; answerType: "pass_fail" | "score"; maxScore: number | null; requiresEvidence: boolean };
type Answer = { value: string | null; score: number | null; note: string | null };

export function StartRunForm({ templates, sites, workOrders, defaults }: { templates: { id: string; name: string }[]; sites: { id: string; name: string }[]; workOrders: { id: string; number: number; title: string; siteId: string }[]; defaults: { siteId?: string; workOrderId?: string; templateId?: string } }) {
  const [siteId, setSiteId] = useState(defaults.siteId ?? "");
  return (
    <ServerForm action={startRunAction} className="space-y-4">
      <Field label="Template" name="templateId" required>
        <Select name="templateId" defaultValue={defaults.templateId ?? ""} required>
          <option value="">Select a template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
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
      <Field label="Linked work order (optional)" name="workOrderId">
        <Select name="workOrderId" defaultValue={defaults.workOrderId ?? ""} key={siteId}>
          <option value="">None</option>
          {workOrders
            .filter((w) => w.siteId === siteId)
            .map((w) => (
              <option key={w.id} value={w.id}>
                WO-{w.number} {w.title}
              </option>
            ))}
        </Select>
      </Field>
      <SubmitButton>Start inspection</SubmitButton>
    </ServerForm>
  );
}

export function AnswersForm({ runId, items, answers, notes, editable }: { runId: string; items: Item[]; answers: Record<string, Answer>; notes: string | null; editable: boolean }) {
  return (
    <ServerForm action={answersAction} className="space-y-3">
      <input type="hidden" name="id" value={runId} />
      <ol className="space-y-3">
        {items.map((it, i) => {
          const a = answers[it.id];
          return (
            <li key={it.id} className="rounded-md border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-900">
                {i + 1}. {it.prompt}
                {it.requiresEvidence && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-normal text-blue-700">photo evidence required</span>}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {it.answerType === "pass_fail" ? (
                  <fieldset className="flex gap-1" disabled={!editable}>
                    <legend className="sr-only">Answer for {it.prompt}</legend>
                    {(["pass", "fail", "na"] as const).map((v) => (
                      <label key={v} className="cursor-pointer">
                        <input type="radio" name={`answer.${it.id}`} value={v} defaultChecked={a?.value === v} className="peer sr-only" />
                        <span
                          className={cn(
                            "inline-block rounded-md border px-3 py-1 text-sm peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500",
                            v === "pass" && "peer-checked:border-green-600 peer-checked:bg-green-50 peer-checked:text-green-800",
                            v === "fail" && "peer-checked:border-red-600 peer-checked:bg-red-50 peer-checked:text-red-800",
                            v === "na" && "peer-checked:border-slate-500 peer-checked:bg-slate-100",
                            "border-slate-300 text-slate-700",
                          )}
                        >
                          {v === "na" ? "N/A" : v === "pass" ? "Pass" : "Fail"}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    Score
                    <select name={`score.${it.id}`} defaultValue={a?.score ?? ""} disabled={!editable} className="input w-24 py-1">
                      <option value="">—</option>
                      {Array.from({ length: (it.maxScore ?? 5) + 1 }, (_, n) => (
                        <option key={n} value={n}>
                          {n} / {it.maxScore ?? 5}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <input name={`note.${it.id}`} defaultValue={a?.note ?? ""} disabled={!editable} placeholder="Note (optional)" aria-label={`Note for ${it.prompt}`} className="input min-w-40 flex-1 py-1" />
              </div>
            </li>
          );
        })}
      </ol>
      <Field label="Overall notes" name="notes">
        <Textarea name="notes" defaultValue={notes ?? ""} disabled={!editable} />
      </Field>
      {editable && (
        <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
          <SubmitButton variant="secondary" name="intent" value="save">
            Save progress
          </SubmitButton>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Sign-off name" name="signedOffByName">
              <Input name="signedOffByName" placeholder="Inspector or client representative" />
            </Field>
            <SubmitButton variant="accent" name="intent" value="submit">
              Submit inspection
            </SubmitButton>
          </div>
        </div>
      )}
    </ServerForm>
  );
}

export function DefectForm({ runId, items }: { runId: string; items: { id: string; prompt: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(true)}>
        Record a defect
      </button>
    );
  return (
    <ServerForm action={addDefectAction} resetOnSuccess onSuccess={() => setOpen(false)} className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <input type="hidden" name="id" value={runId} />
      <Field label="Description" name="description" required>
        <Textarea name="description" required placeholder="What is wrong?" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Severity" name="severity">
          <Select name="severity" defaultValue="medium">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </Field>
        <Field label="Location" name="locationText">
          <Input name="locationText" />
        </Field>
        <Field label="Checklist item" name="templateItemId">
          <Select name="templateItemId" defaultValue="">
            <option value="">—</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.prompt.slice(0, 50)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex gap-2">
        <SubmitButton size="sm">Save defect</SubmitButton>
        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </ServerForm>
  );
}

export function TemplateForm() {
  return (
    <ServerForm action={createTemplateAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Template name" name="name" required className="sm:col-span-3">
          <Input name="name" required placeholder="e.g. Office Cleaning Quality Audit" />
        </Field>
        <Field label="Category" name="category" required>
          <Input name="category" required placeholder="Cleaning" />
        </Field>
        <Field label="Service type" name="serviceType">
          <Input name="serviceType" placeholder="Commercial cleaning" />
        </Field>
      </div>
      <Field label="Checklist items" name="items" required hint='One per line. Add "| evidence" to require a photo, or "| score:5" for a 0–5 score.'>
        <Textarea name="items" rows={8} required placeholder={"Floors clean and dry | evidence\nBins emptied\nOverall presentation | score:5"} />
      </Field>
      <SubmitButton>Create template</SubmitButton>
    </ServerForm>
  );
}
