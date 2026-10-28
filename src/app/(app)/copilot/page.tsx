import { requireContext } from "@/lib/auth/session";
import { requirePagePerm } from "@/lib/page";
import { aiStatus } from "@/domain/ai/provider";
import { SUGGESTED_PROMPTS } from "@/domain/ai/copilot";
import { Notice, PageHeader } from "@/components/ui";
import { CopilotChat } from "./chat";

export const metadata = { title: "AI Copilot" };

export default async function CopilotPage() {
  const ctx = await requireContext();
  requirePagePerm(ctx, "ai.use");
  const status = aiStatus();
  return (
    <>
      <PageHeader title="AI Copilot" description="Ask about your facilities. Answers use only records you are allowed to see." />
      <div className="mb-4 space-y-2">
        {status.configured ? (
          <Notice tone="info" title={`AI provider configured (${status.model})`}>
            The Copilot reads your data through approved, read-only tools. It cannot change records — drafted work orders must be reviewed and created by you.
          </Notice>
        ) : (
          <Notice tone="warn" title="AI provider not configured">
            Running in demo mode: questions are matched to approved data lookups and answered from your real records without a language model. Set <code>AI_API_KEY</code> on the server to enable AI answers.
          </Notice>
        )}
        <p className="text-xs text-slate-500">AI suggestions can be wrong. Verify anything safety-critical on site before acting.</p>
      </div>
      <CopilotChat suggestions={SUGGESTED_PROMPTS} configured={status.configured} />
    </>
  );
}
