"use server";

import { and, eq, isNull } from "drizzle-orm";
import { notifications } from "@/db/schema";
import { runAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/errors";

export async function markAllReadAction(_p: ActionResult | null, _fd: FormData) {
  void _fd;
  return runAction(
    async (ctx, db) => {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.tenantId, ctx.tenantId), eq(notifications.userId, ctx.userId), isNull(notifications.readAt)));
    },
    { revalidate: ["/"], message: "All notifications marked as read." },
  );
}
