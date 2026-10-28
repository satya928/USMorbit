import type { Role } from "@/db/schema";

export const PERMISSIONS = [
  "wo.view",
  "wo.create",
  "wo.edit",
  "wo.assign",
  "wo.execute",
  "wo.inspect",
  "wo.approve",
  "wo.close",
  "wo.cancel",
  "wo.view_internal",
  "site.view",
  "site.manage",
  "asset.view",
  "asset.manage",
  "people.view",
  "people.manage",
  "contractor.view",
  "contractor.manage",
  "compliance.view",
  "compliance.manage",
  "compliance.verify",
  "compliance.override",
  "inspection.view",
  "inspection.run",
  "inspection.template.manage",
  "report.view",
  "report.export",
  "ai.use",
  "settings.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

const READ_ONLY: Permission[] = [
  "wo.view",
  "wo.view_internal",
  "site.view",
  "asset.view",
  "people.view",
  "contractor.view",
  "compliance.view",
  "inspection.view",
  "report.view",
  "report.export",
  "audit.view",
];

/**
 * Role → permission matrix. This is the single source of truth for authorization and is
 * enforced in server-side domain services. UI visibility is derived from it, never the reverse.
 * Record-level scope (tenant, sites, own assignments, own contractor) is applied separately.
 */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  platform_admin: ALL,
  tenant_admin: ALL,
  facilities_manager: new Set<Permission>([
    ...READ_ONLY,
    "wo.create",
    "wo.edit",
    "wo.assign",
    "wo.execute",
    "wo.inspect",
    "wo.approve",
    "wo.close",
    "wo.cancel",
    "site.manage",
    "asset.manage",
    "contractor.manage",
    "compliance.manage",
    "compliance.verify",
    "compliance.override",
    "inspection.run",
    "inspection.template.manage",
    "ai.use",
  ]),
  supervisor: new Set<Permission>([
    "wo.view",
    "wo.view_internal",
    "wo.create",
    "wo.edit",
    "wo.assign",
    "wo.execute",
    "wo.inspect",
    "wo.close",
    "site.view",
    "asset.view",
    "people.view",
    "contractor.view",
    "compliance.view",
    "inspection.view",
    "inspection.run",
    "report.view",
    "report.export",
    "ai.use",
  ]),
  technician: new Set<Permission>(["wo.view", "wo.create", "wo.execute", "site.view", "asset.view", "inspection.view"]),
  contractor_manager: new Set<Permission>([
    "wo.view",
    "wo.assign",
    "wo.execute",
    "site.view",
    "asset.view",
    "people.view",
    "contractor.view",
    "compliance.view",
  ]),
  client_approver: new Set<Permission>(["wo.view", "wo.create", "wo.approve", "site.view", "asset.view", "inspection.view"]),
  auditor: new Set<Permission>(READ_ONLY),
};

/** Roles whose approval permission is granted per-membership rather than by role. */
export const APPROVAL_GRANTABLE: Role[] = ["supervisor"];

export function permissionsFor(role: Role, opts: { canApprove?: boolean } = {}): Set<Permission> {
  const perms = new Set(ROLE_PERMISSIONS[role]);
  if (opts.canApprove && APPROVAL_GRANTABLE.includes(role)) perms.add("wo.approve");
  return perms;
}

export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: "Platform Admin",
  tenant_admin: "Tenant Admin",
  facilities_manager: "Facilities Manager",
  supervisor: "Supervisor",
  technician: "Technician / Cleaner",
  contractor_manager: "Contractor Manager",
  client_approver: "Client Approver",
  auditor: "Read-only Auditor",
};
