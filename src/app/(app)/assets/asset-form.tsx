"use client";

import { Field, Input, Select, ServerForm, SubmitButton } from "@/components/forms";
import type { ActionResult } from "@/lib/errors";

type Values = Partial<Record<string, string | null>>;

export function AssetForm({ action, values = {}, sites, categories }: { action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>; values?: Values; sites: { id: string; name: string }[]; categories: string[] }) {
  const v = (k: string) => values[k] ?? "";
  return (
    <ServerForm action={action} className="space-y-5" warnUnsaved>
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Asset code" name="code" required>
          <Input name="code" defaultValue={v("code")} required className="uppercase" />
        </Field>
        <Field label="Name" name="name" required className="sm:col-span-2">
          <Input name="name" defaultValue={v("name")} required />
        </Field>
        <Field label="Site" name="siteId" required>
          <Select name="siteId" defaultValue={v("siteId")} required>
            <option value="">Select…</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" name="category" required>
          <Select name="category" defaultValue={v("category") || "HVAC"}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Type" name="assetType">
          <Input name="assetType" defaultValue={v("assetType")} placeholder="e.g. Chiller" />
        </Field>
        <Field label="Exact location" name="locationText" className="sm:col-span-3">
          <Input name="locationText" defaultValue={v("locationText")} placeholder="Building, level, room" />
        </Field>
        <Field label="Manufacturer" name="manufacturer">
          <Input name="manufacturer" defaultValue={v("manufacturer")} />
        </Field>
        <Field label="Model" name="model">
          <Input name="model" defaultValue={v("model")} />
        </Field>
        <Field label="Serial number" name="serialNumber">
          <Input name="serialNumber" defaultValue={v("serialNumber")} />
        </Field>
        <Field label="Criticality" name="criticality">
          <Select name="criticality" defaultValue={v("criticality") || "medium"}>
            {["low", "medium", "high", "critical"].map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Condition" name="condition">
          <Select name="condition" defaultValue={v("condition") || "good"}>
            {["good", "fair", "poor", "failed"].map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Install date" name="installDate">
          <Input name="installDate" type="date" defaultValue={v("installDate")} />
        </Field>
        <Field label="Warranty expiry" name="warrantyExpiry">
          <Input name="warrantyExpiry" type="date" defaultValue={v("warrantyExpiry")} />
        </Field>
        <Field label="Last service" name="lastServiceAt">
          <Input name="lastServiceAt" type="date" defaultValue={v("lastServiceAt")} />
        </Field>
        <Field label="Next maintenance" name="nextMaintenanceAt">
          <Input name="nextMaintenanceAt" type="date" defaultValue={v("nextMaintenanceAt")} />
        </Field>
      </div>
      <SubmitButton pendingLabel="Saving…">{values.id ? "Save changes" : "Create asset"}</SubmitButton>
    </ServerForm>
  );
}
