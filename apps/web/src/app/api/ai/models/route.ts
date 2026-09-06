import { NextRequest, NextResponse } from "next/server";
import { discoverLocalModels, getAiModelSettings, reconcileAiModelSettings, saveAiModel, AI_TASKS, type AiTask } from "@/lib/ai-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localOnly(req: NextRequest): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const hostname = host.split(":")[0].toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export async function GET(req: NextRequest) {
  if (!localOnly(req)) return NextResponse.json({ error: "AI model settings are available only from the local app." }, { status: 403 });
  try {
    const models = await discoverLocalModels();
    const reconciled = reconcileAiModelSettings(models);
    return NextResponse.json({ models, settings: reconciled.settings, tasks: AI_TASKS, baseUrl: process.env.AI_BASE_URL || "http://127.0.0.1:8000/v1" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ models: [], settings: getAiModelSettings(), tasks: AI_TASKS, error: error instanceof Error ? error.message : "Unable to discover local models" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(req: NextRequest) {
  if (!localOnly(req)) return NextResponse.json({ error: "AI model settings are available only from the local app." }, { status: 403 });
  try {
    const body = await req.json() as { task?: string; model?: string };
    if (!body.task || !(body.task in AI_TASKS) || typeof body.model !== "string" || !body.model.trim()) return NextResponse.json({ error: "A valid task and model are required." }, { status: 400 });
    const models = await discoverLocalModels();
    if (!models.some((m) => m.id === body.model)) return NextResponse.json({ error: `Model is not currently available: ${body.model}` }, { status: 409 });
    const settings = saveAiModel(body.task as AiTask, body.model);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save model" }, { status: 502 });
  }
}
