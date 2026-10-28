"use client";

import { Field, Input, ServerForm, SubmitButton } from "./forms";
import { uploadFileAction } from "@/app/(app)/files-actions";

export function UploadForm({ entityType, entityId, label = "Upload evidence" }: { entityType: "work_order" | "compliance_item" | "inspection_run"; entityId: string; label?: string }) {
  return (
    <ServerForm action={uploadFileAction} resetOnSuccess className="space-y-2">
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <Field label={label} name="file" hint="JPEG, PNG, WebP or PDF, up to 10 MB. Files are private to your workspace.">
        <Input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" required className="file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-sm" />
      </Field>
      <Field label="Caption" name="caption">
        <Input name="caption" maxLength={300} placeholder="e.g. After repair" />
      </Field>
      <SubmitButton size="sm" variant="secondary" pendingLabel="Uploading…">
        Upload
      </SubmitButton>
    </ServerForm>
  );
}
