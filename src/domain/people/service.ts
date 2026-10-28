import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db";
import {
  complianceItems,
  contractorServiceCategories,
  contractors,
  people,
  sites,
  workCategories,
  workOrders,
} from "@/db/schema";
import { requirePerm, type AuthContext } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { OPEN_STATUSES } from "@/domain/work-orders/state";
import { escapeLike, recordAudit, workOrderScope } from "@/domain/shared";
import { isUuid, parseInput, zList, zOptEmail, zOptText, zOptUuid } from "@/domain/validation";

export const PERSON_TYPE_LABELS = {
  employee: "Employee",
  technician: "Technician",
  supervisor: "Supervisor",
  contractor_contact: "Contractor contact",
  client_contact: "Client contact",
} as const;

export const personInput = z.object({
  name: z.string().trim().min(2, "Name is required").max(200),
  email: zOptEmail,
  phone: zOptText(50),
  personType: z.enum(["employee", "technician", "supervisor", "contractor_contact", "client_contact"]),
  contractorId: zOptUuid,
  homeSiteId: zOptUuid,
  skills: zList,
  active: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()).default(true),
});

export const contractorInput = z.object({
  name: z.string().trim().min(2, "Company name is required").max(200),
  contactName: zOptText(200),
  contactEmail: zOptEmail,
  contactPhone: zOptText(50),
  serviceRegions: zList,
  categoryIds: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.uuid())).default([]),
  status: z.enum(["active", "inactive"]).default("active"),
});

/** Contractor managers are limited to their own contractor's records. */
const contractorScope = (ctx: AuthContext) =>
  ctx.role === "contractor_manager" ? (ctx.contractorId ? eq(contractors.id, ctx.contractorId) : sql`false`) : undefined;

export async function listPeople(db: DbOrTx, ctx: AuthContext, opts: { q?: string; type?: string } = {}) {
  requirePerm(ctx, "people.view");
  const q = opts.q ? `%${escapeLike(opts.q)}%` : null;
  return db
    .select({
      id: people.id,
      name: people.name,
      email: people.email,
      phone: people.phone,
      personType: people.personType,
      skills: people.skills,
      active: people.active,
      userId: people.userId,
      contractorName: contractors.name,
      homeSiteName: sites.name,
    })
    .from(people)
    .leftJoin(contractors, eq(contractors.id, people.contractorId))
    .leftJoin(sites, eq(sites.id, people.homeSiteId))
    .where(
      and(
        eq(people.tenantId, ctx.tenantId),
        ctx.role === "contractor_manager" ? (ctx.contractorId ? eq(people.contractorId, ctx.contractorId) : sql`false`) : undefined,
        opts.type ? eq(people.personType, opts.type as (typeof people.personType.enumValues)[number]) : undefined,
        q ? or(ilike(people.name, q), ilike(people.email, q)) : undefined,
      ),
    )
    .orderBy(asc(people.name));
}

export async function personOptions(db: DbOrTx, ctx: AuthContext) {
  return db
    .select({ id: people.id, name: people.name, personType: people.personType })
    .from(people)
    .where(and(eq(people.tenantId, ctx.tenantId), eq(people.active, true)))
    .orderBy(asc(people.name));
}

export async function getPerson(db: DbOrTx, ctx: AuthContext, id: string) {
  requirePerm(ctx, "people.view");
  if (!isUuid(id)) throw notFound("Person");
  const [p] = await db.select().from(people).where(and(eq(people.id, id), eq(people.tenantId, ctx.tenantId)));
  if (!p) throw notFound("Person");
  if (ctx.role === "contractor_manager" && p.contractorId !== ctx.contractorId) throw notFound("Person");
  const [credentials, work] = await Promise.all([
    ctx.perms.has("compliance.view")
      ? db
          .select()
          .from(complianceItems)
          .where(and(eq(complianceItems.tenantId, ctx.tenantId), eq(complianceItems.personId, id), isNull(complianceItems.archivedAt)))
      : Promise.resolve([]),
    db
      .select({ id: workOrders.id, number: workOrders.workOrderNumber, title: workOrders.title, status: workOrders.status })
      .from(workOrders)
      .where(and(workOrderScope(ctx), eq(workOrders.assigneePersonId, id), inArray(workOrders.status, OPEN_STATUSES))),
  ]);
  return { person: p, credentials, openWork: work };
}

async function validatePersonRefs(db: DbOrTx, ctx: AuthContext, input: z.output<typeof personInput>) {
  if (input.contractorId) {
    const [c] = await db
      .select({ id: contractors.id })
      .from(contractors)
      .where(and(eq(contractors.id, input.contractorId), eq(contractors.tenantId, ctx.tenantId)));
    if (!c) throw new AppError("VALIDATION", "Contractor not found.", { contractorId: "Select a valid contractor" });
  }
  if (input.homeSiteId) {
    const [s] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.id, input.homeSiteId), eq(sites.tenantId, ctx.tenantId)));
    if (!s) throw new AppError("VALIDATION", "Site not found.", { homeSiteId: "Select a valid site" });
  }
}

export async function createPerson(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "people.manage");
  const input = parseInput(personInput, raw);
  await validatePersonRefs(db, ctx, input);
  return db.transaction(async (tx) => {
    const [p] = await tx.insert(people).values({ ...input, tenantId: ctx.tenantId }).returning();
    await recordAudit(tx, ctx, "person.created", "person", p.id);
    return p;
  });
}

export async function updatePerson(db: DbOrTx, ctx: AuthContext, id: string, raw: unknown) {
  requirePerm(ctx, "people.manage");
  const input = parseInput(personInput, raw);
  const { person } = await getPerson(db, ctx, id);
  await validatePersonRefs(db, ctx, input);
  return db.transaction(async (tx) => {
    const [p] = await tx
      .update(people)
      .set({
        ...input,
        email: input.email ?? null,
        phone: input.phone ?? null,
        contractorId: input.contractorId ?? null,
        homeSiteId: input.homeSiteId ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(people.id, person.id), eq(people.tenantId, ctx.tenantId)))
      .returning();
    await recordAudit(tx, ctx, "person.updated", "person", p.id, { active: p.active });
    return p;
  });
}

// ---------------------------------------------------------------------------
// Contractors
// ---------------------------------------------------------------------------

/** Performance measures over all non-cancelled work ever assigned to the contractor (or a window). */
export function contractorPerformanceSql(from?: Date, to?: Date) {
  const window = sql`${from ? sql`and w.created_at >= ${from}` : sql``} ${to ? sql`and w.created_at < ${to}` : sql``}`;
  const open = sql.join(
    OPEN_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  );
  return {
    assigned: sql<number>`(select count(*)::int from ${workOrders} w where w.contractor_id = ${contractors.id} and w.status <> 'cancelled' ${window})`,
    completed: sql<number>`(select count(*)::int from ${workOrders} w where w.contractor_id = ${contractors.id} and w.status in ('approved','closed') ${window})`,
    overdue: sql<number>`(select count(*)::int from ${workOrders} w where w.contractor_id = ${contractors.id} and w.status in (${open}) and w.due_at < now() ${window})`,
    rework: sql<number>`(select count(*)::int from ${workOrders} w where w.contractor_id = ${contractors.id} and w.rework_count > 0 ${window})`,
  };
}

export async function listContractors(db: DbOrTx, ctx: AuthContext, opts: { q?: string } = {}) {
  requirePerm(ctx, "contractor.view");
  const q = opts.q ? `%${escapeLike(opts.q)}%` : null;
  const rows = await db
    .select({
      c: contractors,
      ...contractorPerformanceSql(),
      categories: sql<string[]>`coalesce((select array_agg(wc.name order by wc.name) from ${contractorServiceCategories} csc join ${workCategories} wc on wc.id = csc.category_id where csc.contractor_id = ${contractors.id}), '{}')`,
    })
    .from(contractors)
    .where(
      and(
        eq(contractors.tenantId, ctx.tenantId),
        isNull(contractors.archivedAt),
        contractorScope(ctx),
        q ? or(ilike(contractors.name, q), ilike(contractors.contactName, q)) : undefined,
      ),
    )
    .orderBy(asc(contractors.name));
  return rows.map(({ c, ...rest }) => ({ ...c, ...rest }));
}

export async function contractorOptions(db: DbOrTx, ctx: AuthContext) {
  return db
    .select({ id: contractors.id, name: contractors.name })
    .from(contractors)
    .where(and(eq(contractors.tenantId, ctx.tenantId), isNull(contractors.archivedAt), contractorScope(ctx)))
    .orderBy(asc(contractors.name));
}

export async function getContractor(db: DbOrTx, ctx: AuthContext, id: string) {
  requirePerm(ctx, "contractor.view");
  if (!isUuid(id)) throw notFound("Contractor");
  const [row] = await db
    .select({ c: contractors, ...contractorPerformanceSql() })
    .from(contractors)
    .where(and(eq(contractors.id, id), eq(contractors.tenantId, ctx.tenantId), contractorScope(ctx)));
  if (!row) throw notFound("Contractor");
  const [cats, staff, compliance, work] = await Promise.all([
    db
      .select({ id: workCategories.id, name: workCategories.name })
      .from(contractorServiceCategories)
      .innerJoin(workCategories, eq(workCategories.id, contractorServiceCategories.categoryId))
      .where(eq(contractorServiceCategories.contractorId, id)),
    db
      .select({ id: people.id, name: people.name, personType: people.personType, active: people.active })
      .from(people)
      .where(and(eq(people.tenantId, ctx.tenantId), eq(people.contractorId, id))),
    ctx.perms.has("compliance.view")
      ? db
          .select()
          .from(complianceItems)
          .where(and(eq(complianceItems.tenantId, ctx.tenantId), eq(complianceItems.contractorId, id), isNull(complianceItems.archivedAt)))
      : Promise.resolve([]),
    db
      .select({
        id: workOrders.id,
        number: workOrders.workOrderNumber,
        title: workOrders.title,
        status: workOrders.status,
        priority: workOrders.priority,
        dueAt: workOrders.dueAt,
      })
      .from(workOrders)
      .where(and(workOrderScope(ctx), eq(workOrders.contractorId, id)))
      .orderBy(sql`${workOrders.createdAt} desc`)
      .limit(25),
  ]);
  const { c, ...perf } = row;
  return { contractor: c, performance: perf, categories: cats, staff, compliance, work };
}

async function setCategories(tx: DbOrTx, ctx: AuthContext, contractorId: string, categoryIds: string[]) {
  await tx.delete(contractorServiceCategories).where(eq(contractorServiceCategories.contractorId, contractorId));
  if (!categoryIds.length) return;
  const valid = await tx
    .select({ id: workCategories.id })
    .from(workCategories)
    .where(and(eq(workCategories.tenantId, ctx.tenantId), inArray(workCategories.id, categoryIds)));
  if (valid.length)
    await tx
      .insert(contractorServiceCategories)
      .values(valid.map((v) => ({ tenantId: ctx.tenantId, contractorId, categoryId: v.id })));
}

export async function createContractor(db: DbOrTx, ctx: AuthContext, raw: unknown) {
  requirePerm(ctx, "contractor.manage");
  const { categoryIds, ...input } = parseInput(contractorInput, raw);
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(contractors).values({ ...input, tenantId: ctx.tenantId }).returning();
    await setCategories(tx, ctx, c.id, categoryIds);
    await recordAudit(tx, ctx, "contractor.created", "contractor", c.id);
    return c;
  });
}

export async function updateContractor(db: DbOrTx, ctx: AuthContext, id: string, raw: unknown) {
  requirePerm(ctx, "contractor.manage");
  const { categoryIds, ...input } = parseInput(contractorInput, raw);
  const { contractor } = await getContractor(db, ctx, id);
  return db.transaction(async (tx) => {
    const [c] = await tx
      .update(contractors)
      .set({
        ...input,
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(contractors.id, contractor.id), eq(contractors.tenantId, ctx.tenantId)))
      .returning();
    await setCategories(tx, ctx, c.id, categoryIds);
    await recordAudit(tx, ctx, "contractor.updated", "contractor", c.id);
    return c;
  });
}

export async function categoryOptions(db: DbOrTx, ctx: AuthContext) {
  return db
    .select({ id: workCategories.id, name: workCategories.name, code: workCategories.code, requiredCredential: workCategories.requiredCredential })
    .from(workCategories)
    .where(and(eq(workCategories.tenantId, ctx.tenantId), isNull(workCategories.archivedAt)))
    .orderBy(asc(workCategories.name));
}
