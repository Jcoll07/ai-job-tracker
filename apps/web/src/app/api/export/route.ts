import { NextResponse } from "next/server";
import { listJobs } from "@/lib/jobs";
import { listCvVersions } from "@/lib/cv";
import { getDb, getSetting } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const jobs = listJobs();
  const cvs = listCvVersions();
  const statusHistory = db.prepare(
    "SELECT id, jobId, fromStatus, toStatus, source, note, createdAt FROM status_history ORDER BY id ASC",
  ).all();

  // Deliberately exclude credentials/tokens (Gmail OAuth, extension token, API keys).
  const backup = {
    version: "2.2",
    exportDate: new Date().toISOString(),
    jobs,
    cvs,
    statusHistory,
    profile: getSetting("profile"),
    cvStyleGuide: getSetting<string>("cvStyleGuide"),
    syncIntervalMinutes: getSetting<number>("syncIntervalMinutes"),
    totalJobs: jobs.length,
    totalCvs: cvs.length,
  };

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="job-tracker-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
