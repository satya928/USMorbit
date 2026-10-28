"use client";

import { useState } from "react";
import { Checkbox, Field, Input, Select, ServerForm, SubmitButton, Textarea } from "@/components/forms";
import type { ActionResult } from "@/lib/errors";

type Opt = { id: string; name: string };
const TYPES = {
  insurance: "Insurance certificate",
  licence: "Licence",
  certification: "Certification",
  safety_document: "Safety document (SWMS/SWI)",
  site_procedure: "Site procedure",
  permit: "Permit",
  other: "Other",
};

export function ComplianceForm({
  action,
  values = {},
  options,
}: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  values?: Partial<Record<string, string | boolean | null>>;
  options: { sites: Opt[]; assets: Opt[]; people: Opt[]; contractors: Opt[] };
}) {
  const [subject, setSubject] = useState(String(values.subjectType ?? "contractor"));
  const s = (k: string) => (values[k] as string | null | undefined) ?? "";
  const relation: Record<string, [string, Opt[]]> = { site: ["siteId", options.sites], asset: ["assetId", options.assets], person: ["personId", options.people], contractor: ["contractorId", options.contractors] };
  return (
    <ServerForm action={action} className="space-y-4" warnUnsaved>
      {values.id && <input type="hidden" name="id" value={String(values.id)} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Item name" name="name" required className="sm:col-span-2">
          <Input name="name" defaultValue={s("name")} required placeholder="e.g. Public Liability Insurance" />
        </Field>
        <Field label="Type" name="itemType" required>
          <Select name="itemType" defaultValue={s("itemType") || "insurance"}>
            {Object.entries(TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Applies to" name="subjectType" required>
          <Select name="subjectType" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="contractor">Contractor</option>
            <option value="person">Person</option>
            <option value="site">Site</option>
            <option value="asset">Asset</option>
            <option value="organization">Whole organisation</option>
          </Select>
        </Field>
        {subject !== "organization" && (
          <Field label={`Related ${subject}`} name={relation[subject][0]} required className="sm:col-span-2">
            <Select name={relation[subject][0]} defaultValue={s(relation[subject][0])} required key={subject}>
              <option value="">Select…</option>
              {relation[subject][1].map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Issuer" name="issuer">
          <Input name="issuer" defaultValue={s("issuer")} />
        </Field>
        <Field label="Reference number" name="referenceNumber" hint="Avoid highly sensitive identifiers.">
          <Input name="referenceNumber" defaultValue={s("referenceNumber")} />
        </Field>
        <Field label="Issue date" name="issueDate">
          <Input name="issueDate" type="date" defaultValue={s("issueDate")} />
        </Field>
        <Field label="Expiry date" name="expiryDate">
          <Input name="expiryDate" type="date" defaultValue={s("expiryDate")} />
        </Field>
        <Field label="Notes" name="notes" className="sm:col-span-2">
          <Textarea name="notes" defaultValue={s("notes")} />
        </Field>
      </div>
      {values.id && <Checkbox name="notApplicable" label="Not applicable (exclude from expiry tracking)" defaultChecked={!!values.notApplicable} />}
      <SubmitButton>{values.id ? "Save changes" : "Add compliance item"}</SubmitButton>
    </ServerForm>
  );
}
