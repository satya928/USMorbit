import { and, asc, desc, eq, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import {
  approvalDecisions,
  assets,
  complianceItems,
  contractors,
  fileAttachments,
  inspectionRuns,
  people,
  sites,
  slaPolicies,
  tenants,
  users,
  workCategories,
  workOrderAssignments,
  workOrderChecklistItems,
  workOrderComments,
  workOrderEvents,
  workOrders,
  type Priority,
  type WorkOrderStatus,
} from "@/db/schema";
import { can, requirePerm, requireSite, type AuthContext } from "@/lib/auth/context";
import { AppError, forbidden, invalid, notFound } from "@/lib/errors";
import { computeComplianceStatus } from "@/domain/compliance/status";
import { escapeLike, notifyUsers, pageParams, recordAudit, usersForSite, workOrderScope, type Page } from "@/domain/shared";
import {
  ASSIGNABLE_STATUSES,
  OPEN_STATUSES,
  STATUS_LABELS,
  TERMINAL_STATUSES,
  WORKFLOW,
  canTransition,
  statusAfterAssign,
  type WorkflowAction,
} from "./state";

export const formatWoNumber = (n: number) => `WO-${n}`;

const optionalUuid = z.preprocess((v) => (v === "" || v === null ? undefined : v), z.uuid().optional());
const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());
const optionalMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().min(0).max(10_000_000).optional(),
);
const optionalDate = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : new Date(String(v))),
  z.date().optional(),
);

export const workOrderInput = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
  description: optionalText(5000),
  siteId: z.uuid("Select a site"),
  assetId: optionalUuid,
  categoryId: optionalUuid,
  locationText: optionalText(300),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  dueAt: optionalDate,
  estimatedCost: optionalMoney,
  actualCost: optionalMoney,
  clientVisibleSummary: optionalText(2000),
  internalNotes: optionalText(5000),
  checklist: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
  sourceInspectionId: optionalUuid,
});
export type WorkOrderInput = z.input<typeof workOrderInput>;

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of r.error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
    throw invalid("Please correct the highlighted fields.", fieldErrors);
  }
  return r.data;
}
export { parse as parseInput };

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type WorkOrderFilters = {
  q?: string;
  status?: WorkOrderStatus[];
  priority?: Priority[];
  siteId?: string;
  assigneePersonId?: string;
  contractorId?: string;
  categoryId?: string;
  overdue?: boolean;
  open?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  sort?: "created" | "due" | "priority" | "number" | "status";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export function workOrderFilterConditions(ctx: AuthContext, f: WorkOrderFilters): SQL {
  const conds: (SQL | undefined)[] = [workOrderScope(ctx)];
  if (f.q) {
    const q = `%${escapeLike(f.q.trim())}%`;
    const num = Number(f.q.replace(/^wo-?/i, ""));
    conds.push(
      or(
        ilike(workOrders.title, q),
        ilike(workOrders.description, q),
        ilike(workOrders.locationText, q),
        Number.isInteger(num) && num > 0 ? eq(workOrders.workOrderNumber, num) : undefined,
      ),
    );
  }
  if (f.status?.length) conds.push(inArray(workOrders.status, f.status));
  if (f.priority?.length) conds.push(inArray(workOrders.priority, f.priority));
  if (f.siteId) conds.push(eq(workOrders.siteId, f.siteId));
  if (f.assigneePersonId) conds.push(eq(workOrders.assigneePersonId, f.assigneePersonId));
  if (f.contractorId) conds.push(eq(workOrders.contractorId, f.contractorId));
  if (f.categoryId) conds.push(eq(workOrders.categoryId, f.categoryId));
  if (f.open) conds.push(inArray(workOrders.status, OPEN_STATUSES));
  if (f.overdue) conds.push(and(inArray(workOrders.status, OPEN_STATUSES), lt(workOrders.dueAt, new Date())));
  if (f.createdFrom) conds.push(sql`${workOrders.createdAt} >= ${f.createdFrom}`);
  if (f.createdTo) conds.push(sql`${workOrders.createdAt} < ${f.createdTo}`);
  return and(...conds)!;
}

const priorityRank = sql`case ${workOrders.priority} when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1 end`;

export async function listWorkOrders(db: DbOrTx, ctx: AuthContext, f: WorkOrderFilters = {}) {
  requirePerm(ctx, "wo.view");
  const { page, pageSize, offset } = pageParams(f.page, f.pageSize);
  const where = workOrderFilterConditions(ctx, f);
  const dirFn = f.dir === "asc" ? asc : desc;
  const orderBy = {
    created: dirFn(workOrders.createdAt),
    due: f.dir === "asc" ? sql`${workOrders.dueAt} asc nulls last` : sql`${workOrders.dueAt} desc nulls last`,
    priority: f.dir === "asc" ? sql`${priorityRank} asc` : sql`${priorityRank} desc`,
    number: dirFn(workOrders.workOrderNumber),
    status: dirFn(workOrders.status),
  }[f.sort ?? "created"];

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: workOrders.id,
        number: workOrders.workOrderNumber,
        title: workOrders.title,
        status: workOrders.status,
        priority: workOrders.priority,
        dueAt: workOrders.dueAt,
        createdAt: workOrders.createdAt,
        locationText: workOrders.locationText,
        siteId: sites.id,
        siteName: sites.name,
        siteTimezone: sites.timezone,
        assetName: assets.name,
        categoryName: workCategories.name,
        assigneeName: people.name,
        contractorName: contractors.name,
        reworkCount: workOrders.reworkCount,
      })
      .from(workOrders)
      .innerJoin(sites, eq(sites.id, workOrders.siteId))
      .leftJoin(assets, eq(assets.id, workOrders.assetId))
      .leftJoin(workCategories, eq(workCategories.id, workOrders.categoryId))
      .leftJoin(people, eq(people.id, workOrders.assigneePersonId))
      .leftJoin(contractors, eq(contractors.id, workOrders.contractorId))
      .where(where)
      .orderBy(orderBy, desc(workOrders.workOrderNumber))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(workOrders).where(where),
  ]);
  return { rows, total: count, page, pageSize } satisfies Page<(typeof rows)[number]>;
}
export type WorkOrderListRow = Awaited<ReturnType<typeof listWorkOrders>>["rows"][number];

async function loadScopedWorkOrder(db: DbOrTx, ctx: AuthContext, id: string, forUpdate = false) {
  if (!z.uuid().safeParse(id).success) throw notFound("Work order");
  const q = db
    .select()
    .from(workOrders)
    .where(and(eq(workOrders.id, id), workOrderScope(ctx)))
    .limit(1);
  const [wo] = forUpdate ? await q.for("update") : await q;
  if (!wo) throw notFound("Work order");
  return wo;
}

export async function getWorkOrder(db: DbOrTx, ctx: AuthContext, id: string) {
  requirePerm(ctx, "wo.view");
  const wo = await loadScopedWorkOrder(db, ctx, id);
  const showInternal = can(ctx, "wo.view_internal");

  const [[site], [asset], [category], [assignee], [contractor], checklist, comments, files, events, approvals, inspections] =
    await Promise.all([
      db.select().from(sites).where(eq(sites.id, wo.siteId)),
      wo.assetId ? db.select().from(assets).where(eq(assets.id, wo.assetId)) : Promise.resolve([]),
      wo.categoryId ? db.select().from(workCategories).where(eq(workCategories.id, wo.categoryId)) : Promise.resolve([]),
      wo.assigneePersonId ? db.select().from(people).where(eq(people.id, wo.assigneePersonId)) : Promise.resolve([]),
      wo.contractorId ? db.select().from(contractors).where(eq(contractors.id, wo.contractorId)) : Promise.resolve([]),
      db
        .select()
        .from(workOrderChecklistItems)
        .where(eq(workOrderChecklistItems.workOrderId, wo.id))
        .orderBy(asc(workOrderChecklistItems.position), asc(workOrderChecklistItems.createdAt)),
      db
        .select({ c: workOrderComments, authorName: users.name })
        .from(workOrderComments)
        .innerJoin(users, eq(users.id, workOrderComments.authorUserId))
        .where(
          and(eq(workOrderComments.workOrderId, wo.id), showInternal ? undefined : eq(workOrderComments.internal, false)),
        )
        .orderBy(asc(workOrderComments.createdAt)),
      db
        .select()
        .from(fileAttachments)
        .where(
          and(
            eq(fileAttachments.tenantId, ctx.tenantId),
            eq(fileAttachments.entityType, "work_order"),
            eq(fileAttachments.entityId, wo.id),
          ),
        )
        .orderBy(asc(fileAttachments.createdAt)),
      db
        .select({ e: workOrderEvents, actorName: users.name })
        .from(workOrderEvents)
        .leftJoin(users, eq(users.id, workOrderEvents.actorUserId))
        .where(eq(workOrderEvents.workOrderId, wo.id))
        .orderBy(asc(workOrderEvents.createdAt)),
      db
        .select({ a: approvalDecisions, approverName: users.name })
        .from(approvalDecisions)
        .innerJoin(users, eq(users.id, approvalDecisions.approverUserId))
        .where(eq(approvalDecisions.workOrderId, wo.id))
        .orderBy(desc(approvalDecisions.createdAt)),
      db
        .select({ id: inspectionRuns.id, status: inspectionRuns.status, submittedAt: inspectionRuns.submittedAt })
        .from(inspectionRuns)
        .where(and(eq(inspectionRuns.tenantId, ctx.tenantId), eq(inspectionRuns.workOrderId, wo.id))),
    ]);

  // Internal-only fields never leave the server for roles without access.
  const safeEvents = events.filter((ev) => showInternal || !(ev.e.data as { internal?: boolean }).internal);
  return {
    workOrder: { ...wo, internalNotes: showInternal ? wo.internalNotes : null },
    site,
    asset: asset ?? null,
    category: category ?? null,
    assignee: assignee ? { id: assignee.id, name: assignee.name, userId: assignee.userId, personType: assignee.personType } : null,
    contractor: contractor ?? null,
    checklist,
    comments: comments.map((r) => ({ ...r.c, authorName: r.authorName })),
    files,
    events: safeEvents.map((r) => ({ ...r.e, actorName: r.actorName })),
    approvals: approvals.map((r) => ({ ...r.a, approverName: r.approverName })),
    inspections,
    permissions: actionPermissions(ctx, wo, assignee?.userId ?? null),
  };
}
export type WorkOrderDetail = Awaited<ReturnType<typeof getWorkOrder>>;

/** Whether the actor may execute (start / checklist / evidence / submit) this specific job. */
export function canExecuteRecord(ctx: AuthContext, wo: Pick<typeof workOrders.$inferSelect, "assigneePersonId" | "contractorId">) {
  if (!can(ctx, "wo.execute")) return false;
  if (ctx.role === "technician") return !!ctx.personId && wo.assigneePersonId === ctx.personId;
  if (ctx.role === "contractor_manager") return !!ctx.contractorId && wo.contractorId === ctx.contractorId;
  return true;
}

function isSelfApproval(ctx: AuthContext, assigneeUserId: string | null) {
  return !ctx.tenantSettings.allowSelfApproval && !!assigneeUserId && assigneeUserId === ctx.userId;
}

function actionPermissions(ctx: AuthContext, wo: typeof workOrders.$inferSelect, assigneeUserId: string | null) {
  const exec = canExecuteRecord(ctx, wo);
  const terminal = TERMINAL_STATUSES.includes(wo.status);
  const allowed: WorkflowAction[] = (Object.keys(WORKFLOW) as WorkflowAction[]).filter((a) => {
    const rule = WORKFLOW[a];
    if (!canTransition(a, wo.status) || !can(ctx, rule.perm)) return false;
    if (rule.perm === "wo.execute") return exec;
    if (rule.perm === "wo.approve") return !isSelfApproval(ctx, assigneeUserId);
    return true;
  });
  return {
    actions: allowed,
    canEdit: can(ctx, "wo.edit") && !terminal,
    canAssign:
      can(ctx, "wo.assign") &&
      ASSIGNABLE_STATUSES.includes(wo.status) &&
      (ctx.role !== "contractor_manager" || wo.contractorId === ctx.contractorId),
    canExecute: exec && ["in_progress", "rework_required", "assigned"].includes(wo.status),
    canComment: !terminal && (exec || can(ctx, "wo.edit") || can(ctx, "wo.approve")),
    canInternalComment: can(ctx, "wo.view_internal"),
    canUpload: !terminal && (exec || can(ctx, "wo.edit") || can(ctx, "wo.inspect")),
    selfApprovalBlocked: wo.status === "pending_approval" && can(ctx, "wo.approve") && isSelfApproval(ctx, assigneeUserId),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function logEvent(
  db: DbOrTx,
  ctx: AuthContext,
  workOrderId: string,
  type: string,
  data: Record<string, unknown> = {},
  from?: WorkOrderStatus,
  to?: WorkOrderStatus,
) {
  await db.insert(workOrderEvents).values({
    tenantId: ctx.tenantId,
    workOrderId,
    actorUserId: ctx.userId,
    type,
    fromStatus: from ?? null,
    toStatus: to ?? null,
    data,
  });
}

async function validateRefs(db: DbOrTx, ctx: AuthContext, input: { siteId: string; assetId?: string; categoryId?: string }) {
  requireSite(ctx, input.siteId);
  const [site] = await db
    .select({ id: sites.id, archivedAt: sites.archivedAt })
    .from(sites)
    .where(and(eq(sites.id, input.siteId), eq(sites.tenantId, ctx.tenantId)));
  if (!site) throw invalid("Site not found.", { siteId: "Select a valid site" });
  if (site.archivedAt) throw invalid("This site is archived.", { siteId: "Site is archived" });
  if (input.assetId) {
    const [asset] = await db
      .select({ siteId: assets.siteId })
      .from(assets)
      .where(and(eq(assets.id, input.assetId), eq(assets.tenantId, ctx.tenantId), isNull(assets.archivedAt)));
    if (!asset) throw invalid("Asset not found.", { assetId: "Select a valid asset" });
    if (asset.siteId !== input.siteId) throw invalid("Asset belongs to a different site.", { assetId: "Asset is not at this site" });
  }
  if (input.categoryId) {
    const [cat] = await db
      .select({ id: workCategories.id })
      .from(workCategories)
      .where(and(eq(workCategories.id, input.categoryId), eq(workCategories.tenantId, ctx.tenantId)));
    if (!cat) throw invalid("Category not found.", { categoryId: "Select a valid category" });
  }
}

export async function defaultDueAt(db: DbOrTx, tenantId: string, priority: Priority, from = new Date()) {
  const [p] = await db
    .select({ hours: slaPolicies.resolutionHours })
    .from(slaPolicies)
    .where(and(eq(slaPolicies.tenantId, tenantId), eq(slaPolicies.priority, priority)));
  return p ? new Date(from.getTime() + p.hours * 3_600_000) : null;
}

export async function createWorkOrder(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "wo.create");
  const input = parse(workOrderInput, raw);
  await validateRefs(db, ctx, input);

  // Requesters without edit rights (technicians, client approvers) can raise requests but not set
  // internal fields, costs or a custom due time.
  const privileged = can(ctx, "wo.edit");

  return db.transaction(async (tx) => {
    const [{ seq }] = await tx
      .update(tenants)
      .set({ workOrderSeq: sql`${tenants.workOrderSeq} + 1` })
      .where(eq(tenants.id, ctx.tenantId))
      .returning({ seq: tenants.workOrderSeq });

    const dueAt = (privileged ? input.dueAt : undefined) ?? (await defaultDueAt(tx, ctx.tenantId, input.priority));
    const [wo] = await tx
      .insert(workOrders)
      .values({
        tenantId: ctx.tenantId,
        workOrderNumber: seq,
        title: input.title,
        description: input.description,
        siteId: input.siteId,
        assetId: input.assetId,
        categoryId: input.categoryId,
        locationText: input.locationText,
        priority: input.priority,
        dueAt,
        requesterUserId: ctx.userId,
        estimatedCost: privileged && input.estimatedCost !== undefined ? String(input.estimatedCost) : null,
        clientVisibleSummary: input.clientVisibleSummary,
        internalNotes: privileged ? input.internalNotes : null,
        sourceInspectionId: input.sourceInspectionId,
      })
      .returning();

    const checklist = input.checklist?.length ? input.checklist : ctx.tenantSettings.defaultChecklist;
    if (checklist.length) {
      await tx.insert(workOrderChecklistItems).values(
        checklist.map((label, i) => ({ tenantId: ctx.tenantId, workOrderId: wo.id, label, position: i, required: true })),
      );
    }
    await logEvent(tx, ctx, wo.id, "created", { title: wo.title, priority: wo.priority }, undefined, "new");

    const managers = await usersForSite(tx, ctx.tenantId, wo.siteId, ["facilities_manager", "supervisor"]);
    await notifyUsers(
      tx,
      ctx.tenantId,
      managers.filter((u) => u !== ctx.userId),
      {
        type: "work_order.created",
        title: `${formatWoNumber(wo.workOrderNumber)} created`,
        body: `${wo.title} (${wo.priority})`,
        link: `/work-orders/${wo.id}`,
      },
    );
    return wo;
  });
}

const workOrderUpdateInput = workOrderInput.omit({ checklist: true, sourceInspectionId: true });

export async function updateWorkOrder(db: DbOrTx, ctx: AuthContext, id: string, raw: unknown) {
  requirePerm(ctx, "wo.edit");
  const input = parse(workOrderUpdateInput, raw);
  return db.transaction(async (tx) => {
    const wo = await loadScopedWorkOrder(tx, ctx, id, true);
    if (TERMINAL_STATUSES.includes(wo.status)) throw new AppError("CONFLICT", "Closed or cancelled work orders cannot be edited.");
    await validateRefs(tx, ctx, input);

    const next = {
      title: input.title,
      description: input.description ?? null,
      siteId: input.siteId,
      assetId: input.assetId ?? null,
      categoryId: input.categoryId ?? null,
      locationText: input.locationText ?? null,
      priority: input.priority,
      dueAt: input.dueAt ?? wo.dueAt,
      estimatedCost: input.estimatedCost !== undefined ? input.estimatedCost.toFixed(2) : null,
      actualCost: input.actualCost !== undefined ? input.actualCost.toFixed(2) : null,
      clientVisibleSummary: input.clientVisibleSummary ?? null,
      internalNotes: input.internalNotes ?? null,
    };
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => {
      const a = wo[k];
      const b = next[k];
      return (a instanceof Date ? a.getTime() : a) !== (b instanceof Date ? b.getTime() : b);
    });
    if (!changed.length) return wo;
    const [updated] = await tx
      .update(workOrders)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(workOrders.id, wo.id))
      .returning();
    const sensitive = changed.includes("internalNotes");
    await logEvent(tx, ctx, wo.id, "updated", {
      fields: changed.filter((c) => c !== "internalNotes"),
      ...(changed.includes("priority") ? { priority: { from: wo.priority, to: next.priority } } : {}),
      ...(sensitive && changed.length === 1 ? { internal: true, fields: ["internalNotes"] } : {}),
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Assignment with credential rule
// ---------------------------------------------------------------------------

export const assignInput = z
  .object({
    personId: optionalUuid,
    contractorId: optionalUuid,
    overrideReason: optionalText(500),
  })
  .refine((v) => v.personId || v.contractorId, { message: "Select a person or contractor", path: ["personId"] });

export type CredentialCheck = { ok: true } | { ok: false; reason: string };

/** Configurable rule: a work category may require a named, non-expired, verified person credential. */
export async function checkAssigneeCredential(
  db: DbOrTx,
  tenantId: string,
  categoryId: string | null,
  personId: string,
): Promise<CredentialCheck> {
  if (!categoryId) return { ok: true };
  const [cat] = await db
    .select({ required: workCategories.requiredCredential, name: workCategories.name })
    .from(workCategories)
    .where(and(eq(workCategories.id, categoryId), eq(workCategories.tenantId, tenantId)));
  if (!cat?.required) return { ok: true };
  const items = await db
    .select()
    .from(complianceItems)
    .where(
      and(
        eq(complianceItems.tenantId, tenantId),
        eq(complianceItems.personId, personId),
        ilike(complianceItems.name, `%${escapeLike(cat.required)}%`),
        isNull(complianceItems.archivedAt),
      ),
    );
  if (!items.length) return { ok: false, reason: `${cat.name} work requires "${cat.required}" — no record on file.` };
  const statuses = items.map((i) => computeComplianceStatus(i));
  if (statuses.some((s) => s === "valid" || s === "expiring")) return { ok: true };
  const worst = statuses.includes("expired") ? "expired" : statuses[0].replace("_", " ");
  return { ok: false, reason: `${cat.name} work requires "${cat.required}" — credential is ${worst}.` };
}

export async function assignWorkOrder(db: DbOrTx, ctx: AuthContext, id: string, raw: unknown) {
  requirePerm(ctx, "wo.assign");
  const input = parse(assignInput, raw);

  return db.transaction(async (tx) => {
    const wo = await loadScopedWorkOrder(tx, ctx, id, true);
    if (!ASSIGNABLE_STATUSES.includes(wo.status)) {
      throw new AppError("INVALID_TRANSITION", `Work in status "${STATUS_LABELS[wo.status]}" cannot be reassigned.`);
    }

    let contractorId = input.contractorId ?? null;
    let person: typeof people.$inferSelect | undefined;
    if (input.personId) {
      [person] = await tx
        .select()
        .from(people)
        .where(and(eq(people.id, input.personId), eq(people.tenantId, ctx.tenantId), eq(people.active, true)));
      if (!person) throw invalid("Person not found or inactive.", { personId: "Select an active person" });
      if (person.contractorId) contractorId = contractorId ?? person.contractorId;
    }
    if (contractorId) {
      const [c] = await tx
        .select({ id: contractors.id, status: contractors.status })
        .from(contractors)
        .where(and(eq(contractors.id, contractorId), eq(contractors.tenantId, ctx.tenantId), isNull(contractors.archivedAt)));
      if (!c || c.status !== "active") throw invalid("Contractor not found or inactive.", { contractorId: "Select an active contractor" });
    }
    if (ctx.role === "contractor_manager") {
      if (contractorId !== ctx.contractorId || (person && person.contractorId !== ctx.contractorId)) {
        throw forbidden("Contractor managers can only assign their own contractor's people.");
      }
    }

    let overrideUsed = false;
    if (person && ctx.tenantSettings.enforceCredentials) {
      const check = await checkAssigneeCredential(tx, ctx.tenantId, wo.categoryId, person.id);
      if (!check.ok) {
        if (!input.overrideReason) {
          throw new AppError("CONFLICT", `Assignment blocked: ${check.reason}`, { overrideReason: check.reason });
        }
        if (!can(ctx, "compliance.override")) throw forbidden(`Assignment blocked: ${check.reason} You cannot override this rule.`);
        overrideUsed = true;
        await recordAudit(tx, ctx, "compliance.assignment_override", "work_order", wo.id, {
          personId: person.id,
          reason: input.overrideReason,
          rule: check.reason,
        });
      }
    }

    await tx
      .update(workOrderAssignments)
      .set({ unassignedAt: new Date() })
      .where(and(eq(workOrderAssignments.workOrderId, wo.id), isNull(workOrderAssignments.unassignedAt)));
    await tx.insert(workOrderAssignments).values({
      tenantId: ctx.tenantId,
      workOrderId: wo.id,
      personId: person?.id ?? null,
      contractorId,
      assignedByUserId: ctx.userId,
      overrideReason: overrideUsed ? input.overrideReason : null,
    });

    const to = statusAfterAssign(wo.status);
    const [updated] = await tx
      .update(workOrders)
      .set({ assigneePersonId: person?.id ?? null, contractorId, status: to, updatedAt: new Date() })
      .where(eq(workOrders.id, wo.id))
      .returning();

    const reassigned = !!(wo.assigneePersonId || wo.contractorId);
    await logEvent(
      tx,
      ctx,
      wo.id,
      reassigned ? "reassigned" : "assigned",
      { personName: person?.name ?? null, contractorId, ...(overrideUsed ? { credentialOverride: input.overrideReason } : {}) },
      wo.status,
      to !== wo.status ? to : undefined,
    );

    if (person?.userId) {
      await notifyUsers(tx, ctx.tenantId, [person.userId], {
        type: "work_order.assigned",
        title: `${formatWoNumber(wo.workOrderNumber)} assigned to you`,
        body: wo.title,
        link: `/work-orders/${wo.id}`,
      });
    }
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Workflow transitions
// ---------------------------------------------------------------------------

export const transitionInput = z.object({
  action: z.enum(Object.keys(WORKFLOW) as [WorkflowAction, ...WorkflowAction[]]),
  reason: optionalText(1000),
});

export async function transitionWorkOrder(db: DbOrTx, ctx: AuthContext, id: string, raw: unknown) {
  const { action, reason } = parse(transitionInput, raw);
  const rule = WORKFLOW[action];
  requirePerm(ctx, rule.perm);

  return db.transaction(async (tx) => {
    const wo = await loadScopedWorkOrder(tx, ctx, id, true);
    if (!canTransition(action, wo.status)) {
      throw new AppError(
        "INVALID_TRANSITION",
        `Cannot "${rule.label.toLowerCase()}" a work order that is ${STATUS_LABELS[wo.status].toLowerCase()}.`,
      );
    }
    if (rule.needsReason && !reason) throw invalid("A reason is required.", { reason: "Please provide a reason" });

    const [assignee] = wo.assigneePersonId
      ? await tx.select({ userId: people.userId }).from(people).where(eq(people.id, wo.assigneePersonId))
      : [];
    const assigneeUserId = assignee?.userId ?? null;

    if (rule.perm === "wo.execute" && !canExecuteRecord(ctx, wo)) {
      throw forbidden("Only the assigned technician or a manager can update this job.");
    }
    if (action === "start" && !wo.assigneePersonId && !wo.contractorId) {
      throw new AppError("INVALID_TRANSITION", "Assign the work order before starting it.");
    }
    if (rule.perm === "wo.approve" && isSelfApproval(ctx, assigneeUserId)) {
      throw forbidden("You cannot approve or reject work that you performed.");
    }
    if (action === "mark_ready") {
      const [{ open }] = await tx
        .select({ open: sql<number>`count(*)::int` })
        .from(workOrderChecklistItems)
        .where(
          and(
            eq(workOrderChecklistItems.workOrderId, wo.id),
            eq(workOrderChecklistItems.required, true),
            eq(workOrderChecklistItems.done, false),
          ),
        );
      if (open > 0) throw new AppError("INVALID_TRANSITION", `Complete the ${open} remaining required checklist item(s) first.`);
    }

    const now = new Date();
    const patch: Partial<typeof workOrders.$inferInsert> = { status: rule.to, updatedAt: now };
    if (action === "start" && !wo.startedAt) patch.startedAt = now;
    if (action === "mark_ready") patch.completedAt = now;
    if (action === "pass_inspection") patch.submittedForApprovalAt = now;
    if (action === "approve") patch.approvedAt = now;
    if (action === "close") patch.closedAt = now;
    if (action === "cancel") patch.cancelledAt = now;
    if (rule.to === "rework_required") patch.reworkCount = wo.reworkCount + 1;

    // Optimistic guard: only transition if the status is still what we validated against.
    const [updated] = await tx
      .update(workOrders)
      .set(patch)
      .where(and(eq(workOrders.id, wo.id), eq(workOrders.status, wo.status)))
      .returning();
    if (!updated) throw new AppError("CONFLICT", "This work order was changed by someone else. Refresh and try again.");

    if (rule.perm === "wo.approve") {
      const decision = action === "approve" ? "approved" : action === "reject" ? "rejected" : "rework_requested";
      await tx.insert(approvalDecisions).values({
        tenantId: ctx.tenantId,
        workOrderId: wo.id,
        approverUserId: ctx.userId,
        decision,
        reason: reason ?? null,
      });
    }
    await logEvent(tx, ctx, wo.id, `status.${action}`, reason ? { reason } : {}, wo.status, rule.to);
    await notifyForTransition(tx, ctx, updated, action, assigneeUserId, reason);
    return updated;
  });
}

async function notifyForTransition(
  tx: DbOrTx,
  ctx: AuthContext,
  wo: typeof workOrders.$inferSelect,
  action: WorkflowAction,
  assigneeUserId: string | null,
  reason?: string,
) {
  const num = formatWoNumber(wo.workOrderNumber);
  const link = `/work-orders/${wo.id}`;
  const others = (ids: string[]) => ids.filter((u) => u !== ctx.userId);
  if (action === "mark_ready") {
    const ids = await usersForSite(tx, ctx.tenantId, wo.siteId, ["supervisor", "facilities_manager"]);
    await notifyUsers(tx, ctx.tenantId, others(ids), { type: "work_order.ready", title: `${num} ready for inspection`, body: wo.title, link });
  } else if (action === "pass_inspection") {
    const ids = await usersForSite(tx, ctx.tenantId, wo.siteId, ["client_approver"]);
    await notifyUsers(tx, ctx.tenantId, others(ids), { type: "approval.requested", title: `${num} awaiting your approval`, body: wo.title, link });
  } else if (WORKFLOW[action].to === "rework_required") {
    await notifyUsers(tx, ctx.tenantId, others([assigneeUserId ?? ""]), {
      type: "work_order.rework",
      title: `${num} returned for rework`,
      body: reason ?? wo.title,
      link,
    });
  } else if (action === "approve") {
    const ids = await usersForSite(tx, ctx.tenantId, wo.siteId, ["facilities_manager", "supervisor"]);
    await notifyUsers(tx, ctx.tenantId, others([...ids, assigneeUserId ?? ""]), {
      type: "approval.approved",
      title: `${num} approved by client`,
      body: wo.title,
      link,
    });
  }
}

// ---------------------------------------------------------------------------
// Checklist & comments
// ---------------------------------------------------------------------------

async function requireExecutable(tx: DbOrTx, ctx: AuthContext, id: string) {
  const wo = await loadScopedWorkOrder(tx, ctx, id, true);
  if (TERMINAL_STATUSES.includes(wo.status) || ["approved", "pending_approval"].includes(wo.status)) {
    throw new AppError("CONFLICT", "The checklist is locked once work is submitted for approval.");
  }
  const managerial = can(ctx, "wo.edit");
  if (!managerial && !canExecuteRecord(ctx, wo)) throw forbidden("Only the assignee or a manager can update the checklist.");
  return wo;
}

export async function setChecklistItem(
  db: DbOrTx,
  ctx: AuthContext,
  workOrderId: string,
  itemId: string,
  raw: { done: boolean; result?: string },
) {
  const input = parse(z.object({ done: z.boolean(), result: optionalText(500) }), raw);
  return db.transaction(async (tx) => {
    const wo = await requireExecutable(tx, ctx, workOrderId);
    const [item] = await tx
      .update(workOrderChecklistItems)
      .set({
        done: input.done,
        result: input.result ?? null,
        completedByUserId: input.done ? ctx.userId : null,
        completedAt: input.done ? new Date() : null,
      })
      .where(and(eq(workOrderChecklistItems.id, itemId), eq(workOrderChecklistItems.workOrderId, wo.id)))
      .returning();
    if (!item) throw notFound("Checklist item");
    await logEvent(tx, ctx, wo.id, input.done ? "checklist.completed" : "checklist.reopened", { label: item.label });
    return item;
  });
}

export async function addChecklistItem(db: DbOrTx, ctx: AuthContext, workOrderId: string, raw: unknown) {
  const input = parse(z.object({ label: z.string().trim().min(1).max(300), required: z.boolean().default(true) }), raw);
  return db.transaction(async (tx) => {
    const wo = await requireExecutable(tx, ctx, workOrderId);
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${workOrderChecklistItems.position}), -1)::int` })
      .from(workOrderChecklistItems)
      .where(eq(workOrderChecklistItems.workOrderId, wo.id));
    const [item] = await tx
      .insert(workOrderChecklistItems)
      .values({ tenantId: ctx.tenantId, workOrderId: wo.id, label: input.label, required: input.required, position: max + 1 })
      .returning();
    await logEvent(tx, ctx, wo.id, "checklist.added", { label: item.label });
    return item;
  });
}

export async function addComment(db: DbOrTx, ctx: AuthContext, workOrderId: string, raw: unknown) {
  const input = parse(z.object({ body: z.string().trim().min(1, "Comment cannot be empty").max(4000), internal: z.boolean().default(false) }), raw);
  return db.transaction(async (tx) => {
    const wo = await loadScopedWorkOrder(tx, ctx, workOrderId);
    if (TERMINAL_STATUSES.includes(wo.status)) throw new AppError("CONFLICT", "This work order is closed.");
    const canComment = canExecuteRecord(ctx, wo) || can(ctx, "wo.edit") || can(ctx, "wo.approve");
    if (!canComment) throw forbidden();
    if (input.internal && !can(ctx, "wo.view_internal")) throw forbidden("You cannot post internal notes.");
    const [c] = await tx
      .insert(workOrderComments)
      .values({ tenantId: ctx.tenantId, workOrderId: wo.id, authorUserId: ctx.userId, body: input.body, internal: input.internal })
      .returning();
    await logEvent(tx, ctx, wo.id, "comment.added", { internal: input.internal });
    return c;
  });
}

/** People who can be assigned, annotated with credential eligibility for the work order's category. */
export async function listAssignees(db: DbOrTx, ctx: AuthContext, workOrderId: string) {
  requirePerm(ctx, "wo.assign");
  const wo = await loadScopedWorkOrder(db, ctx, workOrderId);
  const rows = await db
    .select({ id: people.id, name: people.name, personType: people.personType, contractorId: people.contractorId, skills: people.skills })
    .from(people)
    .where(
      and(
        eq(people.tenantId, ctx.tenantId),
        eq(people.active, true),
        inArray(people.personType, ["technician", "supervisor", "employee", "contractor_contact"]),
        ctx.role === "contractor_manager" && ctx.contractorId ? eq(people.contractorId, ctx.contractorId) : undefined,
      ),
    )
    .orderBy(asc(people.name));
  const contractorRows = await db
    .select({ id: contractors.id, name: contractors.name })
    .from(contractors)
    .where(
      and(
        eq(contractors.tenantId, ctx.tenantId),
        eq(contractors.status, "active"),
        isNull(contractors.archivedAt),
        ctx.role === "contractor_manager" && ctx.contractorId ? eq(contractors.id, ctx.contractorId) : undefined,
      ),
    )
    .orderBy(asc(contractors.name));
  const withChecks = await Promise.all(
    rows.map(async (p) => ({ ...p, credential: await checkAssigneeCredential(db, ctx.tenantId, wo.categoryId, p.id) })),
  );
  return { people: withChecks, contractors: contractorRows, enforce: ctx.tenantSettings.enforceCredentials };
}

export async function workOrderCountsByStatus(db: DbOrTx, ctx: AuthContext) {
  return db
    .select({ status: workOrders.status, count: sql<number>`count(*)::int` })
    .from(workOrders)
    .where(and(workOrderScope(ctx), ne(workOrders.status, "cancelled")))
    .groupBy(workOrders.status);
}
