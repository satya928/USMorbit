"use client";

import { useState } from "react";
import { Checkbox, Field, Input, Select, ServerForm, SubmitButton, Textarea } from "@/components/forms";
import { buttonClass } from "@/components/ui";
import { categoryAction, inviteAction, memberAction, memberStatusAction, profileAction, resetPasswordAction, slaAction, workflowAction } from "./actions";

type Opt = { id: string; name: string };
const ROLES: [string, string][] = [
  ["tenant_admin", "Tenant Admin"],
  ["facilities_manager", "Facilities Manager"],
  ["supervisor", "Supervisor"],
  ["technician", "Technician / Cleaner"],
  ["contractor_manager", "Contractor Manager"],
  ["client_approver", "Client Approver"],
  ["auditor", "Read-only Auditor"],
];

export function ProfileForm({ values }: { values: { name: string; country: string | null; timezone: string } }) {
  return (
    <ServerForm action={profileAction} className="grid gap-4 sm:grid-cols-3">
      <Field label="Company name" name="name" className="sm:col-span-3">
        <Input name="name" defaultValue={values.name} required />
      </Field>
      <Field label="Country" name="country">
        <Input name="country" defaultValue={values.country ?? ""} />
      </Field>
      <Field label="Default time zone" name="timezone">
        <Input name="timezone" defaultValue={values.timezone} required />
      </Field>
      <div className="sm:col-span-3">
        <SubmitButton>Save</SubmitButton>
      </div>
    </ServerForm>
  );
}

export function WorkflowForm({ values }: { values: { enforceCredentials: boolean; allowSelfApproval: boolean; defaultChecklist: string[] } }) {
  return (
    <ServerForm action={workflowAction} className="space-y-4">
      <Checkbox name="enforceCredentials" defaultChecked={values.enforceCredentials} label={<><span className="font-medium">Enforce category credentials on assignment.</span> Block assigning work to people without a valid required credential (authorised roles can override with a recorded reason).</>} />
      <Checkbox name="allowSelfApproval" defaultChecked={values.allowSelfApproval} label={<><span className="font-medium">Allow self-approval.</span> Not recommended — lets an approver sign off work they performed.</>} />
      <Field label="Default checklist for new work orders" name="defaultChecklist" hint="One item per line. Used when a work order is created without its own checklist.">
        <Textarea name="defaultChecklist" defaultValue={values.defaultChecklist.join("\n")} rows={4} />
      </Field>
      <SubmitButton>Save workflow settings</SubmitButton>
    </ServerForm>
  );
}

function MemberFields({ sites, contractors, values }: { sites: Opt[]; contractors: Opt[]; values?: { role: string; allSites: boolean; canApprove: boolean; contractorId: string | null; siteIds: string[] } }) {
  const [role, setRole] = useState(values?.role ?? "technician");
  const [all, setAll] = useState(values?.allSites ?? false);
  const forcedAll = role === "tenant_admin";
  return (
    <>
      <Field label="Role" name="role">
        <Select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      {role === "contractor_manager" && (
        <Field label="Contractor" name="contractorId">
          <Select name="contractorId" defaultValue={values?.contractorId ?? ""} required>
            <option value="">Select…</option>
            {contractors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {role === "supervisor" && <Checkbox name="canApprove" defaultChecked={values?.canApprove} label="Can approve client sign-off" />}
      {!forcedAll && (
        <fieldset className="space-y-1">
          <legend className="label">Site access</legend>
          <Checkbox name="allSites" checked={all} onChange={(e) => setAll(e.currentTarget.checked)} label="All sites (including future sites)" />
          {!all && (
            <div className="grid grid-cols-1 gap-1 pl-6 sm:grid-cols-2">
              {sites.map((s) => (
                <Checkbox key={s.id} name="siteIds" value={s.id} defaultChecked={values?.siteIds.includes(s.id)} label={s.name} />
              ))}
            </div>
          )}
        </fieldset>
      )}
    </>
  );
}

export function InviteForm({ sites, contractors }: { sites: Opt[]; contractors: Opt[] }) {
  return (
    <ServerForm action={inviteAction} resetOnSuccess className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" name="name">
          <Input name="name" required />
        </Field>
        <Field label="Email" name="email">
          <Input name="email" type="email" required />
        </Field>
      </div>
      <MemberFields sites={sites} contractors={contractors} />
      <Checkbox name="createPerson" defaultChecked label="Also create a people record (so they can be assigned work)" />
      <SubmitButton>Add user</SubmitButton>
    </ServerForm>
  );
}

export function MemberEditor({ member, sites, contractors, self }: { member: { membershipId: string; role: string; allSites: boolean; canApprove: boolean; contractorId: string | null; siteIds: string[]; status: string }; sites: Opt[]; contractors: Opt[]; self: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-start gap-2">
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Close" : "Edit access"}
        </button>
        {!self && (
          <ServerForm action={resetPasswordAction}>
            <input type="hidden" name="membershipId" value={member.membershipId} />
            <SubmitButton size="sm" variant="ghost" onClick={(e) => !window.confirm("Reset this user's password and sign them out?") && e.preventDefault()}>
              Reset password
            </SubmitButton>
          </ServerForm>
        )}
        {!self && (
          <ServerForm action={memberStatusAction}>
            <input type="hidden" name="membershipId" value={member.membershipId} />
            <input type="hidden" name="active" value={String(member.status !== "active")} />
            <SubmitButton size="sm" variant="ghost">
              {member.status === "active" ? "Disable" : "Enable"}
            </SubmitButton>
          </ServerForm>
        )}
      </div>
      {open && (
        <ServerForm action={memberAction} className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <input type="hidden" name="membershipId" value={member.membershipId} />
          <MemberFields sites={sites} contractors={contractors} values={member} />
          <SubmitButton size="sm">Save access</SubmitButton>
        </ServerForm>
      )}
    </div>
  );
}

export function CategoryForm({ values }: { values?: { id: string; code: string; name: string; requiredCredential: string | null } }) {
  return (
    <ServerForm action={categoryAction} resetOnSuccess={!values} className="flex flex-wrap items-end gap-2">
      {values && <input type="hidden" name="id" value={values.id} />}
      <div className="w-28">
        <Field label="Code" name="code">
          <Input name="code" defaultValue={values?.code} disabled={!!values} required={!values} />
        </Field>
      </div>
      <div className="min-w-40 flex-1">
        <Field label="Name" name="name">
          <Input name="name" defaultValue={values?.name} required />
        </Field>
      </div>
      <div className="min-w-48 flex-1">
        <Field label="Required credential (optional)" name="requiredCredential">
          <Input name="requiredCredential" defaultValue={values?.requiredCredential ?? ""} placeholder="e.g. Electrical Licence" />
        </Field>
      </div>
      <SubmitButton size="sm" variant={values ? "secondary" : "primary"}>
        {values ? "Save" : "Add"}
      </SubmitButton>
    </ServerForm>
  );
}

export function SlaForm({ values }: { values: { priority: string; responseHours: number; resolutionHours: number } }) {
  return (
    <ServerForm action={slaAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="priority" value={values.priority} />
      <span className="w-20 pb-2 text-sm font-medium capitalize">{values.priority}</span>
      <div className="w-32">
        <Field label="Response (h)" name="responseHours">
          <Input name="responseHours" type="number" min={1} defaultValue={values.responseHours} required />
        </Field>
      </div>
      <div className="w-32">
        <Field label="Resolution (h)" name="resolutionHours">
          <Input name="resolutionHours" type="number" min={1} defaultValue={values.resolutionHours} required />
        </Field>
      </div>
      <SubmitButton size="sm" variant="secondary">
        Save
      </SubmitButton>
    </ServerForm>
  );
}
