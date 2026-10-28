"use server";

import { getDb } from "@/db";
import { getContext } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { askCopilot, type CopilotAnswer } from "@/domain/ai/copilot";

export async function askAction(question: string): Promise<CopilotAnswer> {
  const ctx = await getContext();
  if (!ctx) return { mode: "deterministic", text: "Your session has expired. Please sign in again.", refs: [], toolsUsed: [], error: true };
  if (!ctx.perms.has("ai.use")) return { mode: "deterministic", text: "Your role does not include the AI Copilot.", refs: [], toolsUsed: [], error: true };
  try {
    rateLimit(`ai:${ctx.userId}`, 20, 60_000);
  } catch (e) {
    return { mode: "deterministic", text: (e as AppError).message, refs: [], toolsUsed: [], error: true };
  }
  return askCopilot(getDb(), ctx, String(question ?? "").slice(0, 2000));
}
