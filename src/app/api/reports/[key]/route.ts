import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { can } from "@/lib/auth/context";
import { getContext } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { parseReportFilters } from "@/lib/report-filters";
import { addDays } from "@/lib/time";
import { recordAudit } from "@/domain/shared";
import { isReportKey, REPORTS, runReport, toCsv } from "@/domain/reports/service";
import { siteOptions } from "@/domain/sites/service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getContext();
  if (!ctx) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!can(ctx, "report.export")) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { key } = await params;
  if (!isReportKey(key)) return Response.json({ error: "Not found" }, { status: 404 });
  const db = getDb();
  const sites = await siteOptions(db, ctx);
  const sp = req.nextUrl.searchParams;
  const f = parseReportFilters((k) => sp.get(k) ?? undefined, sites.map((s) => s.id));
  try {
    const result = await runReport(db, ctx, key, f);
    const generatedAt = new Date();
    const filters: Record<string, string> = {
      workspace: ctx.tenantName,
      from: f.from.toISOString().slice(0, 10),
      to: addDays(f.to, -1).toISOString().slice(0, 10),
      site: f.siteId ? (sites.find((s) => s.id === f.siteId)?.name ?? "") : "All accessible sites",
      ...(f.status ? { status: f.status } : {}),
      ...(f.priority ? { priority: f.priority } : {}),
      ...(key === "breakdown" ? { groupBy: f.groupBy ?? "site" } : {}),
    };
    await recordAudit(db, ctx, "report.exported", "report", null, { report: key, rows: result.rows.length, filters });
    const csv = toCsv(result, { title: `USM Orbit — ${REPORTS[key].title}`, generatedAt, filters });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="usm-orbit-${key}-${generatedAt.toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
