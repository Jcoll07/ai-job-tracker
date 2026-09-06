import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aiAvailable, parseJobPosting } from "@/lib/ai";
import { fetchUrlContent } from "@/lib/fetch-job";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;
const inputSchema = z.object({
  url: z.string().url().optional(),
  text: z.string().max(MAX_TEXT_CHARS).optional(),
}).strict();

function aiFailureStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : String(err);
  return /Local AI request failed \(HTTP (401|403|404|408|429|500|502|503|504)\)|fetch failed|ECONNREFUSED|ETIMEDOUT|UND_ERR/i.test(message) ? 503 : 502;
}

export async function POST(req: NextRequest) {
  if (!aiAvailable()) return NextResponse.json({ error: "AI provider is not configured" }, { status: 503 });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success || (!parsed.data.url && !parsed.data.text)) return NextResponse.json({ error: "Provide a job posting 'url' or pasted 'text'" }, { status: 400 });
  try {
    const content = parsed.data.text ?? (await fetchUrlContent(parsed.data.url!));
    const job = await parseJobPosting(content);
    return NextResponse.json({ parsed: { ...job, sourceUrl: parsed.data.url ?? null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Analysis failed" }, { status: aiFailureStatus(err) });
  }
}
