import Anthropic from "@anthropic-ai/sdk";

/** Provider-agnostic adapter: the Copilot only depends on this interface. */
export type ProviderTool = { name: string; description: string; input_schema: Record<string, unknown> };
export type ToolExecutor = (name: string, input: unknown) => Promise<{ content: string; isError?: boolean }>;
export type ProviderResult = { text: string; refused?: boolean };

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  run(opts: { system: string; question: string; tools: ProviderTool[]; execute: ToolExecutor; signal?: AbortSignal }): Promise<ProviderResult>;
}

export type AIStatus = { configured: boolean; provider: string | null; model: string | null };

export function aiStatus(): AIStatus {
  const configured = !!process.env.AI_API_KEY && (process.env.AI_PROVIDER ?? "anthropic") === "anthropic";
  return { configured, provider: configured ? "anthropic" : null, model: configured ? defaultModel() : null };
}

const defaultModel = () => process.env.AI_MODEL || "claude-opus-5-5";

class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly model = defaultModel();
  private client = new Anthropic({ apiKey: process.env.AI_API_KEY, timeout: 60_000, maxRetries: 1 });

  async run({ system, question, tools, execute, signal }: Parameters<AIProvider["run"]>[0]): Promise<ProviderResult> {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: question }];
    const toolDefs: Anthropic.Beta.BetaTool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema,
      strict: true,
    }));

    for (let turn = 0; turn < 6; turn++) {
      const response = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: 8000,
          // Route policy declines to a fallback model chosen by the API.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low" },
          system,
          tools: toolDefs,
          tool_choice: { type: "auto" },
          messages,
        },
        { signal },
      );
      if (response.stop_reason === "refusal") {
        return { text: "The AI provider declined this request. Try rephrasing, or use the deterministic demo actions.", refused: true };
      }
      // Append the full content (tool_use, thinking and fallback blocks) so the next turn is valid.
      messages.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || !toolUses.length) {
        const text = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return { text: text || (response.stop_reason === "max_tokens" ? "The answer was cut off. Please ask a narrower question." : "") };
      }
      const results = await Promise.all(
        toolUses.map(async (tu): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const r = await execute(tu.name, tu.input);
          return { type: "tool_result", tool_use_id: tu.id, content: r.content, is_error: r.isError };
        }),
      );
      messages.push({ role: "user", content: results });
    }
    return { text: "I could not finish answering within the tool-call limit. Please ask a narrower question." };
  }
}

export function getProvider(): AIProvider | null {
  return aiStatus().configured ? new AnthropicProvider() : null;
}
