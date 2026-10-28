import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { requireContext } from "@/lib/auth/session";
import { load } from "@/lib/page";
import { getTemplate } from "@/domain/inspections/service";
import { ActionButton } from "@/components/forms";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { archiveTemplateAction } from "../../actions";

export const metadata = { title: "Inspection template" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const { template, items } = await load(getTemplate(getDb(), ctx, id));
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Inspections", href: "/inspections?tab=templates" }, { label: template.name }]}
        title={template.name}
        description={`${template.category}${template.serviceType ? ` · ${template.serviceType}` : ""}`}
        actions={can(ctx, "inspection.run") && !template.archivedAt && <LinkButton href={`/inspections/new?templateId=${template.id}`}>Use template</LinkButton>}
      />
      <Card title={`${items.length} items`} className="max-w-2xl">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {items.map((i) => (
            <li key={i.id}>
              {i.prompt}{" "}
              {i.answerType === "score" ? <Badge tone="violet">Score 0–{i.maxScore ?? 5}</Badge> : <Badge>Pass / fail / N/A</Badge>}{" "}
              {i.requiresEvidence && <Badge tone="blue">Photo required</Badge>}
            </li>
          ))}
        </ol>
        {can(ctx, "inspection.template.manage") && !template.archivedAt && (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <ActionButton action={archiveTemplateAction} label="Archive template" fields={{ id: template.id }} variant="ghost" confirm="Archive this template? Past inspections are kept." />
          </div>
        )}
      </Card>
    </>
  );
}
