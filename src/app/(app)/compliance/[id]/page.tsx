import { and, eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import { getDb } from "@/db";
import { fileAttachments } from "@/db/schema";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { load } from "@/lib/page";
import { formatDate, formatDateTime } from "@/lib/time";
import { COMPLIANCE_TYPE_LABELS, getComplianceItem } from "@/domain/compliance/service";
import { ActionButton } from "@/components/forms";
import { UploadForm } from "@/components/upload-form";
import { Card, ComplianceBadge, DefinitionList, PageHeader } from "@/components/ui";
import { ComplianceForm } from "../compliance-form";
import { archiveComplianceAction, updateComplianceAction, verifyComplianceAction } from "../actions";
import { complianceOptions } from "../options";

export const metadata = { title: "Compliance item" };

export default async function ComplianceItemPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const db = getDb();
  const item = await load(getComplianceItem(db, ctx, id));
  const manage = can(ctx, "compliance.manage");
  const [files, options] = await Promise.all([
    db.select().from(fileAttachments).where(and(eq(fileAttachments.tenantId, ctx.tenantId), eq(fileAttachments.entityType, "compliance_item"), eq(fileAttachments.entityId, item.id))),
    manage ? complianceOptions(db, ctx) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Compliance", href: "/compliance" }, { label: item.name }]}
        title={item.name}
        description={
          <span className="flex items-center gap-2">
            {COMPLIANCE_TYPE_LABELS[item.itemType]} <ComplianceBadge status={item.status} />
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {manage && options ? (
            <Card title="Details">
              <ComplianceForm action={updateComplianceAction} options={options} values={{ ...item, daysToExpiry: null, createdAt: null, updatedAt: null, verifiedAt: null, archivedAt: null }} />
            </Card>
          ) : (
            <Card title="Details">
              <DefinitionList
                items={[
                  ["Applies to", item.subjectType],
                  ["Issuer", item.issuer],
                  ["Reference", item.referenceNumber],
                  ["Issue date", formatDate(item.issueDate)],
                  ["Expiry date", formatDate(item.expiryDate)],
                  ["Notes", item.notes],
                ]}
              />
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card title="Verification">
            <p className="text-sm text-slate-700">
              {item.verificationStatus === "verified" ? (
                <>
                  Verified by <span className="font-medium">{item.verifiedByName}</span> on {formatDateTime(item.verifiedAt, ctx.tenantTimezone)}.
                </>
              ) : (
                "Not yet verified. Check the document against the issuer before verifying."
              )}
            </p>
            {item.daysToExpiry !== null && (
              <p className="mt-2 text-sm text-slate-600">
                {item.daysToExpiry < 0 ? `Expired ${-item.daysToExpiry} days ago.` : `Expires in ${item.daysToExpiry} days.`}
              </p>
            )}
            {can(ctx, "compliance.verify") && (
              <div className="mt-3">
                <ActionButton
                  action={verifyComplianceAction}
                  label={item.verificationStatus === "verified" ? "Remove verification" : "Mark as verified"}
                  fields={{ id: item.id, verified: String(item.verificationStatus !== "verified") }}
                  variant={item.verificationStatus === "verified" ? "secondary" : "accent"}
                />
              </div>
            )}
          </Card>
          <Card title="Documents">
            {files.length ? (
              <ul className="space-y-1">
                {files.map((f) => (
                  <li key={f.id}>
                    <a href={`/api/files/${f.id}`} className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
                      <FileText className="size-4" aria-hidden /> {f.caption || f.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No document uploaded.</p>
            )}
            {manage && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <UploadForm entityType="compliance_item" entityId={item.id} label="Upload document" />
              </div>
            )}
          </Card>
          {manage && (
            <Card>
              <ActionButton action={archiveComplianceAction} label="Archive item" fields={{ id: item.id }} variant="ghost" confirm="Archive this compliance item?" />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
