import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { fileAttachments, workOrderEvents } from "@/db/schema";
import { can, type AuthContext } from "@/lib/auth/context";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { getComplianceItem } from "@/domain/compliance/service";
import { getRun } from "@/domain/inspections/service";
import { recordAudit } from "@/domain/shared";
import { isUuid } from "@/domain/validation";
import { getWorkOrder } from "@/domain/work-orders/service";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export type EntityType = "work_order" | "compliance_item" | "inspection_run";

const storageDir = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");

/** Verify the declared type against the file's magic bytes so a renamed executable is rejected. */
export function sniffContentType(bytes: Uint8Array): string | null {
  const hex = (n: number) => Buffer.from(bytes.subarray(0, n)).toString("hex");
  if (hex(3) === "ffd8ff") return "image/jpeg";
  if (hex(8) === "89504e470d0a1a0a") return "image/png";
  if (Buffer.from(bytes.subarray(0, 4)).toString("latin1") === "%PDF") return "application/pdf";
  if (Buffer.from(bytes.subarray(0, 4)).toString("latin1") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("latin1") === "WEBP")
    return "image/webp";
  return null;
}

export function validateUpload(file: { name: string; type: string; size: number }, bytes: Uint8Array) {
  if (!file.size) throw new AppError("VALIDATION", "The file is empty.");
  if (file.size > MAX_FILE_BYTES) throw new AppError("VALIDATION", "Files must be 10 MB or smaller.");
  const sniffed = sniffContentType(bytes);
  if (!sniffed || !ALLOWED_TYPES[sniffed]) throw new AppError("VALIDATION", "Only JPEG, PNG, WebP images and PDF documents are allowed.");
  if (file.type && file.type !== sniffed) throw new AppError("VALIDATION", "The file type does not match its contents.");
  return sniffed;
}

/** Authorise a write against the parent record. Throws NOT_FOUND / FORBIDDEN. */
async function assertCanAttach(db: DbOrTx, ctx: AuthContext, entityType: EntityType, entityId: string) {
  if (entityType === "work_order") {
    const wo = await getWorkOrder(db, ctx, entityId);
    if (!wo.permissions.canUpload) throw forbidden("You cannot add evidence to this work order.");
  } else if (entityType === "compliance_item") {
    if (!can(ctx, "compliance.manage")) throw forbidden();
    await getComplianceItem(db, ctx, entityId);
  } else {
    const run = await getRun(db, ctx, entityId);
    if (!run.editable) throw forbidden("This inspection is read-only.");
  }
}

/** Authorise a read: the caller must be able to view the parent record. */
async function assertCanRead(db: DbOrTx, ctx: AuthContext, entityType: EntityType, entityId: string) {
  if (entityType === "work_order") await getWorkOrder(db, ctx, entityId);
  else if (entityType === "compliance_item") await getComplianceItem(db, ctx, entityId);
  else await getRun(db, ctx, entityId);
}

export async function uploadAttachment(
  db: DbOrTx,
  ctx: AuthContext,
  entityType: EntityType,
  entityId: string,
  file: { name: string; type: string; size: number; bytes: Uint8Array; caption?: string },
) {
  if (!isUuid(entityId)) throw notFound();
  await assertCanAttach(db, ctx, entityType, entityId);
  const contentType = validateUpload(file, file.bytes);
  const storageKey = `${ctx.tenantId}/${randomUUID()}${ALLOWED_TYPES[contentType]}`;
  const full = path.join(storageDir(), storageKey);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, file.bytes, { mode: 0o600 });

  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "upload";
  const [row] = await db
    .insert(fileAttachments)
    .values({
      tenantId: ctx.tenantId,
      entityType,
      entityId,
      fileName: safeName,
      contentType,
      sizeBytes: file.size,
      storageKey,
      caption: file.caption?.slice(0, 300) || null,
      uploadedByUserId: ctx.userId,
    })
    .returning();
  if (entityType === "work_order") {
    await db
      .insert(workOrderEvents)
      .values({ tenantId: ctx.tenantId, workOrderId: entityId, actorUserId: ctx.userId, type: "evidence.added", data: { fileName: safeName } });
  }
  return row;
}

export async function getAttachmentForDownload(db: DbOrTx, ctx: AuthContext, id: string) {
  if (!isUuid(id)) throw notFound("File");
  const [f] = await db.select().from(fileAttachments).where(and(eq(fileAttachments.id, id), eq(fileAttachments.tenantId, ctx.tenantId)));
  if (!f) throw notFound("File");
  await assertCanRead(db, ctx, f.entityType, f.entityId);
  const resolved = path.resolve(storageDir(), f.storageKey);
  if (!resolved.startsWith(storageDir() + path.sep)) throw notFound("File");
  try {
    const bytes = await readFile(resolved);
    if (f.entityType === "compliance_item") await recordAudit(db, ctx, "file.downloaded", "file", f.id, { entityType: f.entityType });
    return { file: f, bytes };
  } catch {
    throw notFound("File");
  }
}
