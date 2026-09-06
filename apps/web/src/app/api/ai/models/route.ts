import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/db";

const FALLBACK_MODEL = "Qwen2.5.1-Coder-7B-Instruct-4bit";

function isLocalRequest(req: NextRequest): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const hostname = host.split(":")[0].toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export async function GET(req: NextRequest) {
  if (!isLocalRequest(req)) return NextResponse.json({ error: "Local AI model discovery is available only from the local app." }, { status: 403 });

  const base = (process.env.AI_BASE_URL || "http://127.0.0.1:8000/v1").replace(/\/$/, "");
  const configured = [
    process.env.AI_MODEL,
    process.env.AI_MODEL_PARSE,
    process.env.AI_MODEL_CLASSIFY,
    process.env.AI_MODEL_CONTEXT,
    process.env.AI_MODEL_CV,
    process.env.AI_MODEL_ANSWERS,
  ].filter(Boolean) as string[];
  const stored = Object.values(getSetting<Record<string, string>>("aiModels") ?? {}).filter(Boolean);
  const known = [...new Set([FALLBACK_MODEL, ...configured, ...stored])];

  try {
    const headers: Record<string, string> = {};
    const key = process.env.AI_API_KEY || process.env.OMLX_API_KEY;
    if (key) headers.authorization = `Bearer ${key}`;
    const response = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`AI model discovery failed (HTTP ${response.status})`);
    const data = await response.json() as { data?: Array<{ id?: string }> };
    const models = [...new Set((data.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id)))].sort();
    return NextResponse.json({ models: [...new Set([...models, ...known])], source: "local", defaultModel: FALLBACK_MODEL });
  } catch (error) {
    return NextResponse.json({
      models: known,
      source: "configured",
      defaultModel: FALLBACK_MODEL,
      warning: error instanceof Error ? error.message : "Unable to reach local AI server",
    });
  }
}
