CREATE TYPE "public"."answer_type" AS ENUM('pass_fail', 'score');--> statement-breakpoint
CREATE TYPE "public"."answer_value" AS ENUM('pass', 'fail', 'na');--> statement-breakpoint
CREATE TYPE "public"."approval_decision" AS ENUM('approved', 'rejected', 'rework_requested');--> statement-breakpoint
CREATE TYPE "public"."asset_condition" AS ENUM('good', 'fair', 'poor', 'failed');--> statement-breakpoint
CREATE TYPE "public"."attachment_entity" AS ENUM('work_order', 'compliance_item', 'inspection_run');--> statement-breakpoint
CREATE TYPE "public"."compliance_item_type" AS ENUM('insurance', 'licence', 'certification', 'safety_document', 'site_procedure', 'permit', 'other');--> statement-breakpoint
CREATE TYPE "public"."compliance_subject" AS ENUM('site', 'asset', 'person', 'contractor', 'organization');--> statement-breakpoint
CREATE TYPE "public"."criticality" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."inspection_status" AS ENUM('draft', 'in_progress', 'submitted', 'passed', 'failed', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."person_type" AS ENUM('employee', 'technician', 'supervisor', 'contractor_contact', 'client_contact');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."record_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('platform_admin', 'tenant_admin', 'facilities_manager', 'supervisor', 'technician', 'contractor_manager', 'client_approver', 'auditor');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending_review', 'verified');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('new', 'triaged', 'assigned', 'in_progress', 'ready_for_inspection', 'pending_approval', 'rework_required', 'approved', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "ai_interaction_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"feature" text NOT NULL,
	"mode" text NOT NULL,
	"provider" text,
	"model" text,
	"latency_ms" integer NOT NULL,
	"success" boolean NOT NULL,
	"error_code" text,
	"tools_used" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"approver_user_id" uuid NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"asset_type" text,
	"location_text" text,
	"manufacturer" text,
	"model" text,
	"serial_number" text,
	"install_date" date,
	"warranty_expiry" date,
	"criticality" "criticality" DEFAULT 'medium' NOT NULL,
	"condition" "asset_condition" DEFAULT 'good' NOT NULL,
	"last_service_at" date,
	"next_maintenance_at" date,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "assets_tenant_code_uq" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"item_type" "compliance_item_type" NOT NULL,
	"subject_type" "compliance_subject" NOT NULL,
	"site_id" uuid,
	"asset_id" uuid,
	"person_id" uuid,
	"contractor_id" uuid,
	"issuer" text,
	"reference_number" text,
	"issue_date" date,
	"expiry_date" date,
	"not_applicable" boolean DEFAULT false NOT NULL,
	"verification_status" "verification_status" DEFAULT 'pending_review' NOT NULL,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "contractor_service_categories" (
	"tenant_id" uuid NOT NULL,
	"contractor_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "contractor_service_categories_contractor_id_category_id_pk" PRIMARY KEY("contractor_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "contractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"service_regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contractors_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "file_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" "attachment_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"caption" text,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_attachments_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "inspection_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"template_item_id" uuid NOT NULL,
	"value" "answer_value",
	"score" integer,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_answers_uq" UNIQUE("run_id","template_item_id")
);
--> statement-breakpoint
CREATE TABLE "inspection_defects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"template_item_id" uuid,
	"description" text NOT NULL,
	"severity" "severity" DEFAULT 'medium' NOT NULL,
	"location_text" text,
	"linked_work_order_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"work_order_id" uuid,
	"inspector_user_id" uuid NOT NULL,
	"status" "inspection_status" DEFAULT 'in_progress' NOT NULL,
	"score" numeric(5, 2),
	"notes" text,
	"signed_off_by_name" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_runs_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "inspection_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"prompt" text NOT NULL,
	"answer_type" "answer_type" DEFAULT 'pass_fail' NOT NULL,
	"max_score" integer,
	"requires_evidence" boolean DEFAULT false NOT NULL,
	CONSTRAINT "inspection_template_items_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "inspection_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"service_type" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_templates_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"all_sites" boolean DEFAULT false NOT NULL,
	"can_approve" boolean DEFAULT false NOT NULL,
	"contractor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_tenant_user_uq" UNIQUE("tenant_id","user_id"),
	CONSTRAINT "memberships_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"person_type" "person_type" NOT NULL,
	"contractor_id" uuid,
	"home_site_id" uuid,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_access_uq" UNIQUE("membership_id","site_id")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"site_type" text NOT NULL,
	"address" text,
	"city" text,
	"region" text,
	"country" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"manager_person_id" uuid,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "sites_tenant_code_uq" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "sla_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"priority" "priority" NOT NULL,
	"response_hours" integer NOT NULL,
	"resolution_hours" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sla_policies_priority_uq" UNIQUE("tenant_id","priority")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"country" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"work_order_seq" integer DEFAULT 1000 NOT NULL,
	"settings" jsonb DEFAULT '{"enforceCredentials":true,"allowSelfApproval":false,"defaultChecklist":[]}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "work_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"required_credential" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_categories_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "work_categories_code_uq" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "work_order_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"person_id" uuid,
	"contractor_id" uuid,
	"assigned_by_user_id" uuid,
	"override_reason" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unassigned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "work_order_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"result" text,
	"completed_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"type" text NOT NULL,
	"from_status" "work_order_status",
	"to_status" "work_order_status",
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category_id" uuid,
	"site_id" uuid NOT NULL,
	"asset_id" uuid,
	"location_text" text,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"status" "work_order_status" DEFAULT 'new' NOT NULL,
	"requester_user_id" uuid,
	"assignee_person_id" uuid,
	"contractor_id" uuid,
	"source_inspection_id" uuid,
	"due_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"submitted_for_approval_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"rework_count" integer DEFAULT 0 NOT NULL,
	"estimated_cost" numeric(12, 2),
	"actual_cost" numeric(12, 2),
	"client_visible_summary" text,
	"internal_notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "work_orders_number_uq" UNIQUE("tenant_id","work_order_number")
);
--> statement-breakpoint
ALTER TABLE "ai_interaction_logs" ADD CONSTRAINT "ai_interaction_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_interaction_logs" ADD CONSTRAINT "ai_interaction_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_tenant_id_work_order_id_work_orders_tenant_id_id_fk" FOREIGN KEY ("tenant_id","work_order_id") REFERENCES "public"."work_orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_site_id_sites_tenant_id_id_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_tenant_id_site_id_sites_tenant_id_id_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_tenant_id_asset_id_assets_tenant_id_id_fk" FOREIGN KEY ("tenant_id","asset_id") REFERENCES "public"."assets"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_tenant_id_person_id_people_tenant_id_id_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_tenant_id_contractor_id_contractors_tenant_id_id_fk" FOREIGN KEY ("tenant_id","contractor_id") REFERENCES "public"."contractors"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_service_categories" ADD CONSTRAINT "contractor_service_categories_tenant_id_contractor_id_contractors_tenant_id_id_fk" FOREIGN KEY ("tenant_id","contractor_id") REFERENCES "public"."contractors"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractor_service_categories" ADD CONSTRAINT "contractor_service_categories_tenant_id_category_id_work_categories_tenant_id_id_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."work_categories"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_answers" ADD CONSTRAINT "inspection_answers_tenant_id_run_id_inspection_runs_tenant_id_id_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."inspection_runs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_answers" ADD CONSTRAINT "inspection_answers_tenant_id_template_item_id_inspection_template_items_tenant_id_id_fk" FOREIGN KEY ("tenant_id","template_item_id") REFERENCES "public"."inspection_template_items"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_defects" ADD CONSTRAINT "inspection_defects_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_defects" ADD CONSTRAINT "inspection_defects_tenant_id_run_id_inspection_runs_tenant_id_id_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."inspection_runs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_defects" ADD CONSTRAINT "inspection_defects_tenant_id_linked_work_order_id_work_orders_tenant_id_id_fk" FOREIGN KEY ("tenant_id","linked_work_order_id") REFERENCES "public"."work_orders"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_runs" ADD CONSTRAINT "inspection_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_runs" ADD CONSTRAINT "inspection_runs_inspector_user_id_users_id_fk" FOREIGN KEY ("inspector_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_runs" ADD CONSTRAINT "inspection_runs_tenant_id_template_id_inspection_templates_tenant_id_id_fk" FOREIGN KEY ("tenant_id","template_id") REFERENCES "public"."inspection_templates"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_runs" ADD CONSTRAINT "inspection_runs_tenant_id_site_id_sites_tenant_id_id_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_runs" ADD CONSTRAINT "inspection_runs_tenant_id_work_order_id_work_orders_tenant_id_id_fk" FOREIGN KEY ("tenant_id","work_order_id") REFERENCES "public"."work_orders"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_template_items" ADD CONSTRAINT "inspection_template_items_tenant_id_template_id_inspection_templates_tenant_id_id_fk" FOREIGN KEY ("tenant_id","template_id") REFERENCES "public"."inspection_templates"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_contractor_id_contractors_tenant_id_id_fk" FOREIGN KEY ("tenant_id","contractor_id") REFERENCES "public"."contractors"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_tenant_id_contractor_id_contractors_tenant_id_id_fk" FOREIGN KEY ("tenant_id","contractor_id") REFERENCES "public"."contractors"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_tenant_id_home_site_id_sites_tenant_id_id_fk" FOREIGN KEY ("tenant_id","home_site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_access" ADD CONSTRAINT "site_access_tenant_id_membership_id_memberships_tenant_id_id_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_access" ADD CONSTRAINT "site_access_tenant_id_site_id_sites_tenant_id_id_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_categories" ADD CONSTRAINT "work_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_tenant_id_work_order_id_work_orders_tenant_id_id_fk" FOREIGN KEY ("tenant_id","work_order_id") REFERENCES "public"."work_orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_tenant_id_person_id_people_tenant_id_id_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_tenant_id_contractor_id_contractors_tenant_id_id_fk" FOREIGN KEY ("tenant_id","contractor_id") REFERENCES "public"."contractors"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_checklist_items" ADD CONSTRAINT "work_order_checklist_items_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_checklist_items" ADD CONSTRAINT "work_order_checklist_items_tenant_id_work_order_id_work_orders_tenant_id_id_fk" FOREIGN KEY ("tenant_id","work_order_id") REFERENCES "public"."work_orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_comments" ADD CONSTRAINT "work_order_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_comments" ADD CONSTRAINT "work_order_comments_tenant_id_work_order_id_work_orders_tenant_id_id_fk" FOREIGN KEY ("tenant_id","work_order_id") REFERENCES "public"."work_orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_events" ADD CONSTRAINT "work_order_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_events" ADD CONSTRAINT "work_order_events_tenant_id_work_order_id_work_orders_tenant_id_id_fk" FOREIGN KEY ("tenant_id","work_order_id") REFERENCES "public"."work_orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_tenant_id_site_id_sites_tenant_id_id_fk" FOREIGN KEY ("tenant_id","site_id") REFERENCES "public"."sites"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_tenant_id_asset_id_assets_tenant_id_id_fk" FOREIGN KEY ("tenant_id","asset_id") REFERENCES "public"."assets"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_tenant_id_category_id_work_categories_tenant_id_id_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."work_categories"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_tenant_id_assignee_person_id_people_tenant_id_id_fk" FOREIGN KEY ("tenant_id","assignee_person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_tenant_id_contractor_id_contractors_tenant_id_id_fk" FOREIGN KEY ("tenant_id","contractor_id") REFERENCES "public"."contractors"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_logs_tenant_idx" ON "ai_interaction_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "approvals_wo_idx" ON "approval_decisions" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "approvals_tenant_created_idx" ON "approval_decisions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_tenant_site_idx" ON "assets" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "audit_tenant_created_idx" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "compliance_tenant_expiry_idx" ON "compliance_items" USING btree ("tenant_id","expiry_date");--> statement-breakpoint
CREATE INDEX "compliance_person_idx" ON "compliance_items" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "contractors_tenant_idx" ON "contractors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "files_entity_idx" ON "file_attachments" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "defects_run_idx" ON "inspection_defects" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "inspection_runs_tenant_site_idx" ON "inspection_runs" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("tenant_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "people_tenant_user_uq" ON "people" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "people_tenant_idx" ON "people" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sites_tenant_idx" ON "sites" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "woa_wo_idx" ON "work_order_assignments" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "woci_wo_idx" ON "work_order_checklist_items" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "woc_wo_idx" ON "work_order_comments" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "woe_wo_idx" ON "work_order_events" USING btree ("work_order_id","created_at");--> statement-breakpoint
CREATE INDEX "woe_tenant_created_idx" ON "work_order_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "wo_tenant_status_idx" ON "work_orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "wo_tenant_site_idx" ON "work_orders" USING btree ("tenant_id","site_id");--> statement-breakpoint
CREATE INDEX "wo_tenant_priority_idx" ON "work_orders" USING btree ("tenant_id","priority");--> statement-breakpoint
CREATE INDEX "wo_tenant_due_idx" ON "work_orders" USING btree ("tenant_id","due_at");--> statement-breakpoint
CREATE INDEX "wo_tenant_created_idx" ON "work_orders" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "wo_tenant_assignee_idx" ON "work_orders" USING btree ("tenant_id","assignee_person_id");--> statement-breakpoint
CREATE INDEX "wo_tenant_contractor_idx" ON "work_orders" USING btree ("tenant_id","contractor_id");