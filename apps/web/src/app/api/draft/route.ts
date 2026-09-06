import { NextRequest, NextResponse } from "next/server";
import { EMPTY_PROFILE, profileSchema, type Profile } from "@jobtrackr/core";
import { aiAvailable, draftAnswer } from "@/lib/ai";
import { getDb, getSetting } from "@/lib/db";

export const maxDuration = 60;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_QUESTION_CHARS = 20_000;

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
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const input = body as { question?: unknown; jobId?: unknown };
  if (typeof input.question !== "string" || !input.question.trim() || input.question.length > MAX_QUESTION_CHARS) return NextResponse.json({ error: "question is required and must be at most 20,000 characters" }, { status: 400 });
  if (input.jobId !== undefined && (!Number.isInteger(input.jobId) || Number(input.jobId) <= 0)) return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });

  const profile: Profile = profileSchema.parse(getSetting("profile") ?? EMPTY_PROFILE);
  const job = input.jobId
    ? (getDb().prepare("SELECT company, jobTitle, description, skills FROM jobs WHERE id = ?").get(input.jobId) as { company:string; jobTitle:string; description:string|null; skills:string|null } | undefined)
    : undefined;
  try {
    const answer = await draftAnswer({ question: input.question.trim(), profile, job });
    return NextResponse.json({ answer }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Draft failed" }, { status: aiFailureStatus(err) });
  }
}
