import { NextRequest, NextResponse } from "next/server";
import { JOB_STATUSES } from "@jobtrackr/core";
import { z } from "zod";
import { deleteJobs, updateJob } from "@/lib/jobs";

const bulkSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  action: z.enum(["delete", "updateStatus", "updateDate"]),
  status: z.enum(JOB_STATUSES).optional(),
  dateApplied: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { ids, action, status, dateApplied } = parsed.data;

  if (action === "delete") {
    return NextResponse.json({ deleted: deleteJobs(ids) });
  }
  let updated = 0;
  for (const id of ids) {
    if (action === "updateStatus" && status) {
      if (updateJob(id, { status })) updated++;
    } else if (action === "updateDate" && dateApplied) {
      if (updateJob(id, { dateApplied })) updated++;
    }
  }
  return NextResponse.json({ updated });
}
