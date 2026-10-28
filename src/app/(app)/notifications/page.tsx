import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { Bell } from "lucide-react";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { requireContext } from "@/lib/auth/session";
import { relativeTime } from "@/lib/time";
import { ActionButton } from "@/components/forms";
import { Card, cn, EmptyState, PageHeader } from "@/components/ui";
import { markAllReadAction } from "./actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireContext();
  const rows = await getDb()
    .select()
    .from(notifications)
    .where(and(eq(notifications.tenantId, ctx.tenantId), eq(notifications.userId, ctx.userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <>
      <PageHeader title="Notifications" description={`${unread} unread`} actions={unread > 0 && <ActionButton action={markAllReadAction} label="Mark all as read" fields={{}} />} />
      <Card bodyClassName="p-0">
        {rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.map((n) => (
              <li key={n.id} className={cn("px-4 py-3", !n.readAt && "bg-blue-50/50")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {n.link ? (
                      <Link href={n.link} className="text-sm font-medium text-slate-900 hover:underline">
                        {!n.readAt && <span className="mr-1.5 inline-block size-2 rounded-full bg-brand-600" aria-label="Unread" />}
                        {n.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    )}
                    {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
                  </div>
                  <time className="shrink-0 text-xs text-slate-500" dateTime={n.createdAt.toISOString()}>
                    {relativeTime(n.createdAt)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Bell className="size-8" />} title="You're all caught up" description="Assignments, approval requests and compliance alerts appear here." />
        )}
      </Card>
    </>
  );
}
