import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Tenant integrity: every tenant-owned table carries `tenant_id` and a UNIQUE (tenant_id, id).
 * Child records reference parents through composite (tenant_id, <fk>) foreign keys, so the
 * database itself rejects a record that points at another tenant's row.
 */

export const roleEnum = pgEnum("role", [
  "platform_admin",
  "tenant_admin",
  "facilities_manager",
  "supervisor",
  "technician",
  "contractor_manager",
  "client_approver",
  "auditor",
]);

export const workOrderStatusEnum = pgEnum("work_order_status", [
  "new",
  "triaged",
  "assigned",
  "in_progress",
  "ready_for_inspection",
  "pending_approval",
  "rework_required",
  "approved",
  "closed",
  "cancelled",
]);

export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "critical"]);
export const criticalityEnum = pgEnum("criticality", ["low", "medium", "high", "critical"]);
export const assetConditionEnum = pgEnum("asset_condition", ["good", "fair", "poor", "failed"]);
export const recordStatusEnum = pgEnum("record_status", ["active", "inactive"]);
export const membershipStatusEnum = pgEnum("membership_status", ["active", "disabled"]);

export const personTypeEnum = pgEnum("person_type", [
  "employee",
  "technician",
  "supervisor",
  "contractor_contact",
  "client_contact",
]);

export const complianceSubjectEnum = pgEnum("compliance_subject", [
  "site",
  "asset",
  "person",
  "contractor",
  "organization",
]);

export const complianceItemTypeEnum = pgEnum("compliance_item_type", [
  "insurance",
  "licence",
  "certification",
  "safety_document",
  "site_procedure",
  "permit",
  "other",
]);

export const verificationStatusEnum = pgEnum("verification_status", ["pending_review", "verified"]);

export const inspectionStatusEnum = pgEnum("inspection_status", [
  "draft",
  "in_progress",
  "submitted",
  "passed",
  "failed",
  "needs_review",
]);

export const answerTypeEnum = pgEnum("answer_type", ["pass_fail", "score"]);
export const answerValueEnum = pgEnum("answer_value", ["pass", "fail", "na"]);
export const severityEnum = pgEnum("severity", ["low", "medium", "high", "critical"]);
export const approvalDecisionEnum = pgEnum("approval_decision", ["approved", "rejected", "rework_requested"]);
export const attachmentEntityEnum = pgEnum("attachment_entity", ["work_order", "compliance_item", "inspection_run"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const ts = (name: string) => timestamp(name, { withTimezone: true });

// ---------------------------------------------------------------------------
// Identity & tenancy
// ---------------------------------------------------------------------------

export type TenantSettings = {
  enforceCredentials: boolean;
  allowSelfApproval: boolean;
  defaultChecklist: string[];
};

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  country: text("country"),
  timezone: text("timezone").notNull().default("UTC"),
  isDemo: boolean("is_demo").notNull().default(false),
  workOrderSeq: integer("work_order_seq").notNull().default(1000),
  settings: jsonb("settings")
    .$type<TenantSettings>()
    .notNull()
    .default({ enforceCredentials: true, allowSelfApproval: false, defaultChecklist: [] }),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastLoginAt: ts("last_login_at"),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 of the cookie token; raw token is never stored
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** External sign-in identities (e.g. Google). `subject` is the provider's stable user ID. */
export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    email: text("email").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastUsedAt: ts("last_used_at"),
  },
  (t) => [unique("user_identities_provider_subject_uq").on(t.provider, t.subject), index("user_identities_user_idx").on(t.userId)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    status: membershipStatusEnum("status").notNull().default("active"),
    allSites: boolean("all_sites").notNull().default(false),
    canApprove: boolean("can_approve").notNull().default(false),
    contractorId: uuid("contractor_id"),
    ...timestamps,
  },
  (t) => [
    unique("memberships_tenant_user_uq").on(t.tenantId, t.userId),
    unique("memberships_tenant_id_uq").on(t.tenantId, t.id),
    foreignKey({ columns: [t.tenantId, t.contractorId], foreignColumns: [contractors.tenantId, contractors.id] }),
  ],
);

export const siteAccess = pgTable(
  "site_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    siteId: uuid("site_id").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("site_access_uq").on(t.membershipId, t.siteId),
    foreignKey({ columns: [t.tenantId, t.membershipId], foreignColumns: [memberships.tenantId, memberships.id] }).onDelete(
      "cascade",
    ),
    foreignKey({ columns: [t.tenantId, t.siteId], foreignColumns: [sites.tenantId, sites.id] }).onDelete("cascade"),
  ],
);

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    siteType: text("site_type").notNull(),
    address: text("address"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    timezone: text("timezone").notNull().default("UTC"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    managerPersonId: uuid("manager_person_id"),
    status: recordStatusEnum("status").notNull().default("active"),
    archivedAt: ts("archived_at"),
    ...timestamps,
  },
  (t) => [
    unique("sites_tenant_id_uq").on(t.tenantId, t.id),
    unique("sites_tenant_code_uq").on(t.tenantId, t.code),
    index("sites_tenant_idx").on(t.tenantId),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    assetType: text("asset_type"),
    locationText: text("location_text"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    serialNumber: text("serial_number"),
    installDate: date("install_date"),
    warrantyExpiry: date("warranty_expiry"),
    criticality: criticalityEnum("criticality").notNull().default("medium"),
    condition: assetConditionEnum("condition").notNull().default("good"),
    lastServiceAt: date("last_service_at"),
    nextMaintenanceAt: date("next_maintenance_at"),
    archivedAt: ts("archived_at"),
    ...timestamps,
  },
  (t) => [
    unique("assets_tenant_id_uq").on(t.tenantId, t.id),
    unique("assets_tenant_code_uq").on(t.tenantId, t.code),
    index("assets_tenant_site_idx").on(t.tenantId, t.siteId),
    foreignKey({ columns: [t.tenantId, t.siteId], foreignColumns: [sites.tenantId, sites.id] }),
  ],
);

// ---------------------------------------------------------------------------
// People & contractors
// ---------------------------------------------------------------------------

export const contractors = pgTable(
  "contractors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    serviceRegions: text("service_regions").array().notNull().default(sql`'{}'::text[]`),
    status: recordStatusEnum("status").notNull().default("active"),
    archivedAt: ts("archived_at"),
    ...timestamps,
  },
  (t) => [unique("contractors_tenant_id_uq").on(t.tenantId, t.id), index("contractors_tenant_idx").on(t.tenantId)],
);

export const workCategories = pgTable(
  "work_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    // Name of a person credential (compliance item) required to be assigned work in this category.
    requiredCredential: text("required_credential"),
    archivedAt: ts("archived_at"),
    ...timestamps,
  },
  (t) => [unique("work_categories_tenant_id_uq").on(t.tenantId, t.id), unique("work_categories_code_uq").on(t.tenantId, t.code)],
);

export const contractorServiceCategories = pgTable(
  "contractor_service_categories",
  {
    tenantId: uuid("tenant_id").notNull(),
    contractorId: uuid("contractor_id").notNull(),
    categoryId: uuid("category_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.contractorId, t.categoryId] }),
    foreignKey({ columns: [t.tenantId, t.contractorId], foreignColumns: [contractors.tenantId, contractors.id] }).onDelete(
      "cascade",
    ),
    foreignKey({ columns: [t.tenantId, t.categoryId], foreignColumns: [workCategories.tenantId, workCategories.id] }).onDelete(
      "cascade",
    ),
  ],
);

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    personType: personTypeEnum("person_type").notNull(),
    contractorId: uuid("contractor_id"),
    homeSiteId: uuid("home_site_id"),
    skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("people_tenant_id_uq").on(t.tenantId, t.id),
    uniqueIndex("people_tenant_user_uq").on(t.tenantId, t.userId),
    index("people_tenant_idx").on(t.tenantId),
    foreignKey({ columns: [t.tenantId, t.contractorId], foreignColumns: [contractors.tenantId, contractors.id] }),
    foreignKey({ columns: [t.tenantId, t.homeSiteId], foreignColumns: [sites.tenantId, sites.id] }),
  ],
);

export const slaPolicies = pgTable(
  "sla_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    priority: priorityEnum("priority").notNull(),
    responseHours: integer("response_hours").notNull(),
    resolutionHours: integer("resolution_hours").notNull(),
    ...timestamps,
  },
  (t) => [unique("sla_policies_priority_uq").on(t.tenantId, t.priority)],
);

// ---------------------------------------------------------------------------
// Work management
// ---------------------------------------------------------------------------

export const workOrders = pgTable(
  "work_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workOrderNumber: integer("work_order_number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    categoryId: uuid("category_id"),
    siteId: uuid("site_id").notNull(),
    assetId: uuid("asset_id"),
    locationText: text("location_text"),
    priority: priorityEnum("priority").notNull().default("medium"),
    status: workOrderStatusEnum("status").notNull().default("new"),
    requesterUserId: uuid("requester_user_id").references(() => users.id),
    assigneePersonId: uuid("assignee_person_id"),
    contractorId: uuid("contractor_id"),
    sourceInspectionId: uuid("source_inspection_id"),
    dueAt: ts("due_at"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    submittedForApprovalAt: ts("submitted_for_approval_at"),
    approvedAt: ts("approved_at"),
    closedAt: ts("closed_at"),
    cancelledAt: ts("cancelled_at"),
    reworkCount: integer("rework_count").notNull().default(0),
    estimatedCost: numeric("estimated_cost", { precision: 12, scale: 2 }),
    actualCost: numeric("actual_cost", { precision: 12, scale: 2 }),
    clientVisibleSummary: text("client_visible_summary"),
    internalNotes: text("internal_notes"),
    archivedAt: ts("archived_at"),
    ...timestamps,
  },
  (t) => [
    unique("work_orders_tenant_id_uq").on(t.tenantId, t.id),
    unique("work_orders_number_uq").on(t.tenantId, t.workOrderNumber),
    index("wo_tenant_status_idx").on(t.tenantId, t.status),
    index("wo_tenant_site_idx").on(t.tenantId, t.siteId),
    index("wo_tenant_priority_idx").on(t.tenantId, t.priority),
    index("wo_tenant_due_idx").on(t.tenantId, t.dueAt),
    index("wo_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("wo_tenant_assignee_idx").on(t.tenantId, t.assigneePersonId),
    index("wo_tenant_contractor_idx").on(t.tenantId, t.contractorId),
    foreignKey({ columns: [t.tenantId, t.siteId], foreignColumns: [sites.tenantId, sites.id] }),
    foreignKey({ columns: [t.tenantId, t.assetId], foreignColumns: [assets.tenantId, assets.id] }),
    foreignKey({ columns: [t.tenantId, t.categoryId], foreignColumns: [workCategories.tenantId, workCategories.id] }),
    foreignKey({ columns: [t.tenantId, t.assigneePersonId], foreignColumns: [people.tenantId, people.id] }),
    foreignKey({ columns: [t.tenantId, t.contractorId], foreignColumns: [contractors.tenantId, contractors.id] }),
  ],
);

export const workOrderAssignments = pgTable(
  "work_order_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    workOrderId: uuid("work_order_id").notNull(),
    personId: uuid("person_id"),
    contractorId: uuid("contractor_id"),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id),
    overrideReason: text("override_reason"),
    assignedAt: ts("assigned_at").notNull().defaultNow(),
    unassignedAt: ts("unassigned_at"),
  },
  (t) => [
    index("woa_wo_idx").on(t.workOrderId),
    foreignKey({ columns: [t.tenantId, t.workOrderId], foreignColumns: [workOrders.tenantId, workOrders.id] }).onDelete(
      "cascade",
    ),
    foreignKey({ columns: [t.tenantId, t.personId], foreignColumns: [people.tenantId, people.id] }),
    foreignKey({ columns: [t.tenantId, t.contractorId], foreignColumns: [contractors.tenantId, contractors.id] }),
  ],
);

export const workOrderChecklistItems = pgTable(
  "work_order_checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    workOrderId: uuid("work_order_id").notNull(),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
    required: boolean("required").notNull().default(true),
    done: boolean("done").notNull().default(false),
    result: text("result"),
    completedByUserId: uuid("completed_by_user_id").references(() => users.id),
    completedAt: ts("completed_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("woci_wo_idx").on(t.workOrderId),
    foreignKey({ columns: [t.tenantId, t.workOrderId], foreignColumns: [workOrders.tenantId, workOrders.id] }).onDelete(
      "cascade",
    ),
  ],
);

export const workOrderComments = pgTable(
  "work_order_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    workOrderId: uuid("work_order_id").notNull(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    internal: boolean("internal").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("woc_wo_idx").on(t.workOrderId),
    foreignKey({ columns: [t.tenantId, t.workOrderId], foreignColumns: [workOrders.tenantId, workOrders.id] }).onDelete(
      "cascade",
    ),
  ],
);

// Append-only timeline. The application only ever INSERTs into this table.
export const workOrderEvents = pgTable(
  "work_order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    workOrderId: uuid("work_order_id").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    type: text("type").notNull(),
    fromStatus: workOrderStatusEnum("from_status"),
    toStatus: workOrderStatusEnum("to_status"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("woe_wo_idx").on(t.workOrderId, t.createdAt),
    index("woe_tenant_created_idx").on(t.tenantId, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.workOrderId], foreignColumns: [workOrders.tenantId, workOrders.id] }).onDelete(
      "cascade",
    ),
  ],
);

export const fileAttachments = pgTable(
  "file_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    entityType: attachmentEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    caption: text("caption"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("files_entity_idx").on(t.tenantId, t.entityType, t.entityId)],
);

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export const complianceItems = pgTable(
  "compliance_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    itemType: complianceItemTypeEnum("item_type").notNull(),
    subjectType: complianceSubjectEnum("subject_type").notNull(),
    siteId: uuid("site_id"),
    assetId: uuid("asset_id"),
    personId: uuid("person_id"),
    contractorId: uuid("contractor_id"),
    issuer: text("issuer"),
    referenceNumber: text("reference_number"),
    issueDate: date("issue_date"),
    expiryDate: date("expiry_date"),
    notApplicable: boolean("not_applicable").notNull().default(false),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("pending_review"),
    verifiedByUserId: uuid("verified_by_user_id").references(() => users.id),
    verifiedAt: ts("verified_at"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    archivedAt: ts("archived_at"),
    ...timestamps,
  },
  (t) => [
    unique("compliance_tenant_id_uq").on(t.tenantId, t.id),
    index("compliance_tenant_expiry_idx").on(t.tenantId, t.expiryDate),
    index("compliance_person_idx").on(t.tenantId, t.personId),
    foreignKey({ columns: [t.tenantId, t.siteId], foreignColumns: [sites.tenantId, sites.id] }),
    foreignKey({ columns: [t.tenantId, t.assetId], foreignColumns: [assets.tenantId, assets.id] }),
    foreignKey({ columns: [t.tenantId, t.personId], foreignColumns: [people.tenantId, people.id] }),
    foreignKey({ columns: [t.tenantId, t.contractorId], foreignColumns: [contractors.tenantId, contractors.id] }),
  ],
);

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------

export const inspectionTemplates = pgTable(
  "inspection_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    serviceType: text("service_type"),
    archivedAt: ts("archived_at"),
    ...timestamps,
  },
  (t) => [unique("inspection_templates_tenant_id_uq").on(t.tenantId, t.id)],
);

export const inspectionTemplateItems = pgTable(
  "inspection_template_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    templateId: uuid("template_id").notNull(),
    position: integer("position").notNull().default(0),
    prompt: text("prompt").notNull(),
    answerType: answerTypeEnum("answer_type").notNull().default("pass_fail"),
    maxScore: integer("max_score"),
    requiresEvidence: boolean("requires_evidence").notNull().default(false),
  },
  (t) => [
    unique("inspection_template_items_tenant_id_uq").on(t.tenantId, t.id),
    foreignKey({
      columns: [t.tenantId, t.templateId],
      foreignColumns: [inspectionTemplates.tenantId, inspectionTemplates.id],
    }).onDelete("cascade"),
  ],
);

export const inspectionRuns = pgTable(
  "inspection_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").notNull(),
    siteId: uuid("site_id").notNull(),
    workOrderId: uuid("work_order_id"),
    inspectorUserId: uuid("inspector_user_id")
      .notNull()
      .references(() => users.id),
    status: inspectionStatusEnum("status").notNull().default("in_progress"),
    score: numeric("score", { precision: 5, scale: 2 }),
    notes: text("notes"),
    signedOffByName: text("signed_off_by_name"),
    startedAt: ts("started_at").notNull().defaultNow(),
    submittedAt: ts("submitted_at"),
    ...timestamps,
  },
  (t) => [
    unique("inspection_runs_tenant_id_uq").on(t.tenantId, t.id),
    index("inspection_runs_tenant_site_idx").on(t.tenantId, t.siteId),
    foreignKey({
      columns: [t.tenantId, t.templateId],
      foreignColumns: [inspectionTemplates.tenantId, inspectionTemplates.id],
    }),
    foreignKey({ columns: [t.tenantId, t.siteId], foreignColumns: [sites.tenantId, sites.id] }),
    foreignKey({ columns: [t.tenantId, t.workOrderId], foreignColumns: [workOrders.tenantId, workOrders.id] }),
  ],
);

export const inspectionAnswers = pgTable(
  "inspection_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    runId: uuid("run_id").notNull(),
    templateItemId: uuid("template_item_id").notNull(),
    value: answerValueEnum("value"),
    score: integer("score"),
    note: text("note"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("inspection_answers_uq").on(t.runId, t.templateItemId),
    foreignKey({ columns: [t.tenantId, t.runId], foreignColumns: [inspectionRuns.tenantId, inspectionRuns.id] }).onDelete(
      "cascade",
    ),
    foreignKey({
      columns: [t.tenantId, t.templateItemId],
      foreignColumns: [inspectionTemplateItems.tenantId, inspectionTemplateItems.id],
    }),
  ],
);

export const inspectionDefects = pgTable(
  "inspection_defects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    runId: uuid("run_id").notNull(),
    templateItemId: uuid("template_item_id"),
    description: text("description").notNull(),
    severity: severityEnum("severity").notNull().default("medium"),
    locationText: text("location_text"),
    linkedWorkOrderId: uuid("linked_work_order_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("defects_run_idx").on(t.runId),
    foreignKey({ columns: [t.tenantId, t.runId], foreignColumns: [inspectionRuns.tenantId, inspectionRuns.id] }).onDelete(
      "cascade",
    ),
    foreignKey({ columns: [t.tenantId, t.linkedWorkOrderId], foreignColumns: [workOrders.tenantId, workOrders.id] }),
  ],
);

// ---------------------------------------------------------------------------
// Approvals, notifications, audit, AI
// ---------------------------------------------------------------------------

export const approvalDecisions = pgTable(
  "approval_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    workOrderId: uuid("work_order_id").notNull(),
    approverUserId: uuid("approver_user_id")
      .notNull()
      .references(() => users.id),
    decision: approvalDecisionEnum("decision").notNull(),
    reason: text("reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("approvals_wo_idx").on(t.workOrderId),
    index("approvals_tenant_created_idx").on(t.tenantId, t.createdAt),
    foreignKey({ columns: [t.tenantId, t.workOrderId], foreignColumns: [workOrders.tenantId, workOrders.id] }).onDelete(
      "cascade",
    ),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key"),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.tenantId, t.userId, t.createdAt),
    uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

export const aiInteractionLogs = pgTable(
  "ai_interaction_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    feature: text("feature").notNull(),
    mode: text("mode").notNull(), // "llm" | "deterministic"
    provider: text("provider"),
    model: text("model"),
    latencyMs: integer("latency_ms").notNull(),
    success: boolean("success").notNull(),
    errorCode: text("error_code"),
    toolsUsed: text("tools_used").array().notNull().default(sql`'{}'::text[]`),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("ai_logs_tenant_idx").on(t.tenantId, t.createdAt)],
);

export type WorkOrderStatus = (typeof workOrderStatusEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];
export type ComplianceSubject = (typeof complianceSubjectEnum.enumValues)[number];
export type ComplianceItemType = (typeof complianceItemTypeEnum.enumValues)[number];
export type InspectionStatus = (typeof inspectionStatusEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];
