"use client";

import { Checkbox, Field, Input, Select, ServerForm, SubmitButton } from "@/components/forms";
import type { ActionResult } from "@/lib/errors";

type Act = (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
type Opt = { id: string; name: string };

export function PersonForm({ action, values, contractors, sites }: { action: Act; values?: { id?: string; name?: string; email?: string | null; phone?: string | null; personType?: string; contractorId?: string | null; homeSiteId?: string | null; skills?: string[]; active?: boolean }; contractors: Opt[]; sites: Opt[] }) {
  const v = values ?? {};
  return (
    <ServerForm action={action} className="space-y-4">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="name" required>
          <Input name="name" defaultValue={v.name} required />
        </Field>
        <Field label="Type" name="personType" required>
          <Select name="personType" defaultValue={v.personType ?? "technician"}>
            <option value="technician">Technician / cleaner</option>
            <option value="supervisor">Supervisor</option>
            <option value="employee">Employee</option>
            <option value="contractor_contact">Contractor contact</option>
            <option value="client_contact">Client contact</option>
          </Select>
        </Field>
        <Field label="Email" name="email">
          <Input name="email" type="email" defaultValue={v.email ?? ""} />
        </Field>
        <Field label="Phone" name="phone">
          <Input name="phone" defaultValue={v.phone ?? ""} />
        </Field>
        <Field label="Contractor company" name="contractorId">
          <Select name="contractorId" defaultValue={v.contractorId ?? ""}>
            <option value="">— In-house —</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Home site" name="homeSiteId">
          <Select name="homeSiteId" defaultValue={v.homeSiteId ?? ""}>
            <option value="">—</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Skills" name="skills" className="sm:col-span-2" hint="Comma-separated, e.g. HVAC, Electrical">
          <Input name="skills" defaultValue={v.skills?.join(", ")} />
        </Field>
      </div>
      {v.id && <Checkbox name="active" label="Active (can be assigned work)" defaultChecked={v.active ?? true} />}
      <p className="text-xs text-slate-500">Do not record government IDs, bank details or unrelated HR information.</p>
      <SubmitButton>{v.id ? "Save" : "Add person"}</SubmitButton>
    </ServerForm>
  );
}

export function ContractorForm({ action, values, categories }: { action: Act; values?: { id?: string; name?: string; contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null; serviceRegions?: string[]; status?: string; categoryIds?: string[] }; categories: Opt[] }) {
  const v = values ?? {};
  return (
    <ServerForm action={action} className="space-y-4">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name" name="name" required className="sm:col-span-2">
          <Input name="name" defaultValue={v.name} required />
        </Field>
        <Field label="Contact name" name="contactName">
          <Input name="contactName" defaultValue={v.contactName ?? ""} />
        </Field>
        <Field label="Contact email" name="contactEmail">
          <Input name="contactEmail" type="email" defaultValue={v.contactEmail ?? ""} />
        </Field>
        <Field label="Contact phone" name="contactPhone">
          <Input name="contactPhone" defaultValue={v.contactPhone ?? ""} />
        </Field>
        <Field label="Status" name="status">
          <Select name="status" defaultValue={v.status ?? "active"}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <Field label="Service regions" name="serviceRegions" className="sm:col-span-2" hint="Comma-separated">
          <Input name="serviceRegions" defaultValue={v.serviceRegions?.join(", ")} />
        </Field>
      </div>
      <fieldset>
        <legend className="label">Service categories</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.map((c) => (
            <Checkbox key={c.id} name="categoryIds" value={c.id} label={c.name} defaultChecked={v.categoryIds?.includes(c.id)} />
          ))}
        </div>
      </fieldset>
      <SubmitButton>{v.id ? "Save" : "Add contractor"}</SubmitButton>
    </ServerForm>
  );
}
