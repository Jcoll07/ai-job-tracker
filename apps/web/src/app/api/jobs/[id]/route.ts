import { NextRequest, NextResponse } from "next/server";
import { JOB_STATUSES } from "@jobtrackr/core";
import { getDb } from "@/lib/db";
import { deleteJobs, getJob, updateJob } from "@/lib/jobs";

type Params = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const emails = getDb()
    .prepare("SELECT * FROM emails WHERE jobId = ? ORDER BY receivedAt DESC")
    .all(job.id);
  const history = getDb()
    .prepare("SELECT * FROM status_history WHERE jobId = ? ORDER BY createdAt DESC")
    .all(job.id);
  return NextResponse.json({ job, emails, history });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });

  let patch: Record<string, unknown>;
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (patch.status !== undefined && !JOB_STATUSES.includes(patch.status as (typeof JOB_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid job status" }, { status: 400 });
  }

  const job = updateJob(id, patch);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  const n = deleteJobs([id]);
  if (!n) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ deleted: n });
}
