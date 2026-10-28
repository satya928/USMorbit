"use server";

import { runAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { uploadAttachment, type EntityType } from "@/domain/files/service";

const PATHS: Record<EntityType, string> = { work_order: "/work-orders", compliance_item: "/compliance", inspection_run: "/inspections" };

export async function uploadFileAction(_p: ActionResult | null, fd: FormData) {
  const entityType = String(fd.get("entityType")) as EntityType;
  const entityId = String(fd.get("entityId"));
  return runAction(
    async (ctx, db) => {
      if (!(entityType in PATHS)) throw new AppError("VALIDATION", "Unknown attachment target.");
      rateLimit(`upload:${ctx.userId}`, 30, 60_000);
      const file = fd.get("file");
      if (!(file instanceof File) || !file.size) throw new AppError("VALIDATION", "Choose a file to upload.", { file: "Choose a file" });
      const bytes = new Uint8Array(await file.arrayBuffer());
      return uploadAttachment(db, ctx, entityType, entityId, { name: file.name, type: file.type, size: file.size, bytes, caption: String(fd.get("caption") ?? "") });
    },
    { revalidate: [`${PATHS[entityType] ?? "/"}/${entityId}`], message: "File uploaded." },
  );
}
