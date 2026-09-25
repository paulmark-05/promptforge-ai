import { NextResponse } from "next/server";
import { getConfig } from "../../../lib/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = getConfig();
  return NextResponse.json({
    serverKey: Boolean(cfg),
    model: cfg?.model ?? process.env.LLM_MODEL ?? "openai/gpt-oss-120b",
  });
}
