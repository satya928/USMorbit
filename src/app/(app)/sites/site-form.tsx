"use client";

import { Field, Input, Select, ServerForm, SubmitButton } from "@/components/forms";
import type { ActionResult } from "@/lib/errors";

const TIMEZONES = ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Perth", "Australia/Adelaide", "Pacific/Auckland", "Asia/Singapore", "Asia/Kolkata", "Asia/Dubai", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "UTC"];

type Values = Partial<Record<"id" | "code" | "name" | "siteType" | "address" | "city" | "region" | "country" | "timezone" | "contactName" | "contactEmail" | "managerPersonId" | "status", string | null>>;

export function SiteForm({ action, values = {}, siteTypes, people }: { action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>; values?: Values; siteTypes: string[]; people: { id: string; name: string }[] }) {
  const tzs = values.timezone && !TIMEZONES.includes(values.timezone) ? [values.timezone, ...TIMEZONES] : TIMEZONES;
  return (
    <ServerForm action={action} className="space-y-5" warnUnsaved>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Site code" name="code" required hint="Short unique code, e.g. NBP">
          <Input name="code" defaultValue={values.code ?? ""} required maxLength={20} className="uppercase" />
        </Field>
        <Field label="Site name" name="name" required className="sm:col-span-2">
          <Input name="name" defaultValue={values.name ?? ""} required />
        </Field>
        <Field label="Site type" name="siteType" required>
          <Select name="siteType" defaultValue={values.siteType ?? "Office"}>
            {siteTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Time zone" name="timezone" required hint="Times for this site display in this zone.">
          <Select name="timezone" defaultValue={values.timezone ?? "Australia/Sydney"}>
            {tzs.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status" name="status">
          <Select name="status" defaultValue={values.status ?? "active"}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Address" name="address" className="sm:col-span-3">
          <Input name="address" defaultValue={values.address ?? ""} />
        </Field>
        <Field label="City" name="city">
          <Input name="city" defaultValue={values.city ?? ""} />
        </Field>
        <Field label="Region / state" name="region">
          <Input name="region" defaultValue={values.region ?? ""} />
        </Field>
        <Field label="Country" name="country">
          <Input name="country" defaultValue={values.country ?? ""} />
        </Field>
        <Field label="Site manager" name="managerPersonId">
          <Select name="managerPersonId" defaultValue={values.managerPersonId ?? ""}>
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Site contact" name="contactName">
          <Input name="contactName" defaultValue={values.contactName ?? ""} />
        </Field>
        <Field label="Contact email" name="contactEmail">
          <Input name="contactEmail" type="email" defaultValue={values.contactEmail ?? ""} />
        </Field>
      </div>
      <SubmitButton pendingLabel="Saving…">{values.id ? "Save changes" : "Create site"}</SubmitButton>
    </ServerForm>
  );
}
