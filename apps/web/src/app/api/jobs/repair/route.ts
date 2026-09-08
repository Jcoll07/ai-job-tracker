import { NextRequest, NextResponse } from "next/server";
import { aiAvailable, parseJobPostings } from "@/lib/ai";
import { getDb, getSetting, setSetting, deleteSetting } from "@/lib/db";
import { getJob, updateJob } from "@/lib/jobs";
import { fetchJobPosting } from "@/lib/fetch-job";
import type { Job } from "@jobtrackr/core";

export const maxDuration = 60;
const REPAIR_VERSION = 2;
let workerRunning = false;

function local(req: NextRequest) {
  const h = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

function normalizeJobType(value: unknown): "On site" | "Remote" | "Hybrid" | "?" {
  const v = String(value ?? "").trim().toLowerCase().replace(/[–—-]/g, " ").replace(/\s+/g, " ");
  if (!v) return "?";
  if (/\bremote\b|\bfully remote\b|\b100% remote\b/.test(v)) return "Remote";
  if (/\bhybrid\b/.test(v)) return "Hybrid";
  if (/\bon site\b|\bonsite\b|\bin office\b|\boffice based\b/.test(v)) return "On site";
  return "?";
}

function needs(j: Job) {
  return Boolean(j.sourceUrl) || !j.description || j.description.trim().length < 80 || !j.location || j.location.trim() === "?" || !j.jobType || j.jobType.trim() === "" || j.jobType.trim() === "?";
}

function about(content: string) {
  const m = content.match(/ABOUT_THE_JOB_VERBATIM:\n([\s\S]*?)(?:\nPage text:\n|$)/i);
  return m?.[1] ?? null;
}

function state() { return getSetting<any>("jobRepairState"); }
function status() {
  return {
    running: workerRunning || Boolean(getSetting<any>("jobRepairWorker")?.running),
    state: state(),
    result: getSetting<any>("jobRepairLastResult"),
    error: getSetting<any>("jobRepairError"),
  };
}
function start() { if (!workerRunning) void run(); }

async function run() {
  if (workerRunning) return;
  workerRunning = true;
  setSetting("jobRepairWorker", { running: true, startedAt: new Date().toISOString(), version: REPAIR_VERSION });
  deleteSetting("jobRepairError");
  try {
    let s = state();
    if (!s || !Array.isArray(s.queue) || s.queue.length === 0) {
      const jobs = (getDb().prepare("SELECT * FROM jobs ORDER BY id ASC").all() as Job[]).filter(needs).map(j => j.id);
      s = { queue: jobs, processed: 0, total: jobs.length, errors: [], updated: 0, startedAt: new Date().toISOString(), version: REPAIR_VERSION };
      setSetting("jobRepairState", s);
    }

    for (let i = 0; i < 1000; i++) {
      const id = s.queue.shift();
      if (id == null) break;
      const job = getJob(Number(id));
      if (!job) { s.processed++; continue; }
      try {
        const patch: Record<string, unknown> = {};
        if (job.sourceUrl) {
          const verified = await fetchJobPosting(job.sourceUrl);
          if (!verified.open) throw new Error("job posting is closed or expired");
          patch.sourceUrl = verified.url;

          const verbatim = about(verified.content);
          if (verbatim) patch.description = verbatim;

          if (aiAvailable()) {
            try {
              const parsed = (await parseJobPostings(verified.content))[0] as any;
              if (parsed?.location && String(parsed.location).trim() && parsed.location !== "?") patch.location = String(parsed.location).trim();
              const normalizedType = normalizeJobType(parsed?.jobType);
              if (normalizedType !== "?") patch.jobType = normalizedType;
              if (parsed?.salaryRange) patch.salaryRange = parsed.salaryRange;
              if (parsed?.experience) patch.experience = parsed.experience;
              if (parsed?.skills) patch.skills = parsed.skills;
              if (!patch.description && parsed?.description) patch.description = parsed.description;
            } catch { /* verified URL/description repair remains useful without AI parsing */ }
          }
        }

        if (!patch.jobType) patch.jobType = normalizeJobType(job.jobType);
        if (!patch.jobType || patch.jobType === "?") patch.jobType = "?";
        if (Object.keys(patch).length > 0) { updateJob(job.id, patch, "repair"); s.updated++; }
      } catch (e) {
        s.errors.push(`${job.id}: ${e instanceof Error ? e.message : String(e)}`);
        const normalizedType = normalizeJobType(job.jobType);
        if (normalizedType !== job.jobType) { updateJob(job.id, { jobType: normalizedType }, "repair"); s.updated++; }
      }

      s.processed++;
      setSetting("jobRepairState", s);
      setSetting("jobRepairLastResult", { processed: s.processed, total: s.total, updated: s.updated, errors: s.errors, done: s.queue.length === 0, at: new Date().toISOString(), version: REPAIR_VERSION });
      if (!s.queue.length) {
        setSetting("jobRepairCompletedAt", new Date().toISOString());
        setSetting("jobRepairCompletedVersion", REPAIR_VERSION);
        setSetting("jobRepairLastResult", { processed: s.processed, total: s.total, updated: s.updated, errors: s.errors, done: true, at: new Date().toISOString(), version: REPAIR_VERSION });
        deleteSetting("jobRepairState");
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }
  } catch (e) {
    setSetting("jobRepairError", { at: new Date().toISOString(), error: e instanceof Error ? e.message : "Repair failed" });
  } finally {
    workerRunning = false;
    setSetting("jobRepairWorker", { running: false, finishedAt: new Date().toISOString(), version: REPAIR_VERSION });
  }
}

export async function POST(req: NextRequest) {
  if (!local(req)) return NextResponse.json({ error: "Job repair is available only from the local app." }, { status: 403 });
  const completedVersion = getSetting<number>("jobRepairCompletedVersion");
  if (completedVersion === REPAIR_VERSION) return NextResponse.json({ started: false, ...status() });
  start();
  return NextResponse.json({ started: true, ...status() });
}

export async function GET(req: NextRequest) {
  if (!local(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const s = state();
  if (!workerRunning && s?.queue?.length) start();
  return NextResponse.json(status());
}
