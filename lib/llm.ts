// Minimal client for any OpenAI-compatible chat completions API.
// Defaults to Groq (free tier, fast) but works with OpenAI, OpenRouter, etc.
// by changing LLM_BASE_URL and LLM_MODEL.

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface ChatResult {
  text: string;
  latencyMs: number;
  tokens?: { prompt: number; completion: number };
  model: string;
}

export function getConfig(userKey?: string | null): LlmConfig | null {
  const apiKey = (userKey && userKey.trim()) || process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "";
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
    model: process.env.LLM_MODEL || "openai/gpt-oss-120b",
  };
}

export async function chat(
  cfg: LlmConfig,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: { temperature?: number; json?: boolean; maxTokens?: number; retries?: number; maxWaitMs?: number } = {},
): Promise<ChatResult> {
  let start = Date.now();
  const body = JSON.stringify({
    model: cfg.model,
    messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 1500,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    // Reasoning models spend output tokens on hidden reasoning; keep it short
    // so free-tier tokens-per-minute limits go further.
    ...(/gpt-oss/.test(cfg.model) ? { reasoning_effort: "low" } : {}),
  });
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    start = Date.now();
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body,
      signal: AbortSignal.timeout(45_000),
    });
    if (res.status !== 429 || attempt >= (opts.retries ?? 1)) break;
    // Wait as long as the provider asks (Retry-After), within a cap.
    const waitMs = Math.min((Number(res.headers.get("retry-after")) || 5) * 1000 + 250, opts.maxWaitMs ?? 20_000);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const hint = res.status === 401 ? "Invalid API key." : res.status === 429 ? "Rate limit reached, try again shortly." : "";
    throw new Error(`LLM request failed (${res.status}). ${hint} ${errText.slice(0, 200)}`.trim());
  }
  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    latencyMs: Date.now() - start,
    tokens: data.usage ? { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens } : undefined,
    model: data.model || cfg.model,
  };
}

// Parse a JSON object from model output, tolerating code fences or stray text.
export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("Model did not return valid JSON.");
  }
}
