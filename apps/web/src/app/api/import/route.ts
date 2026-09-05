import { NextRequest, NextResponse } from "next/server";
import { CV_FAMILIES, legacyBackupSchema, profileSchema } from "@jobtrackr/core";
import { createJob, findDuplicate } from "@/lib/jobs";
import { createCvVersion, listCvVersions } from "@/lib/cv";
import { getDb, setSetting } from "@/lib/db";

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

type BackupBody = {
  jobs?: unknown;
  cvs?: Array<{ name?: string; family?: string; summary?: string; content?: string }>;
  profile?: unknown;
  cvStyleGuide?: unknown;
  syncIntervalMinutes?: unknown;
  statusHistory?: Array<{
    jobId?: number;
    fromStatus?: string | null;
    toStatus?: string;
    source?: string;
    note?: string | null;
    createdAt?: string;
  }>;
};

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BACKUP_BYTES) {
    return NextResponse.json({ error: "Backup file is too large (5 MB maximum)" }, { status: 413 });
  }

  let body: BackupBody;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BACKUP_BYTES) {
      return NextResponse.json({ error: "Backup file is too large (5 MB maximum)" }, { status: 413 });
    }
    body = JSON.parse(raw) as BackupBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON backup file" }, { status: 400 });
  }

  const parsed = legacyBackupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Not a recognized backup file (expected { jobs: [...] })" }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  const jobIdMap = new Map<string, number>();

  for (const legacy of parsed.data.jobs) {
    const company = legacy.company?.trim();
    const jobTitle = legacy.jobTitle?.trim();
    if (!company || !jobTitle) {
      skipped++;
      continue;
    }
    if (findDuplicate(company, jobTitle)) {
      skipped++;
      continue;
    }
    const job = createJob({
      company,
      jobTitle,
      location: legacy.location ?? null,
      sourceUrl: legacy.sourceUrl && legacy.sourceUrl !== "Manual Entry" ? legacy.sourceUrl : null,
      salaryRange: legacy.salaryRange ?? null,
      jobType: legacy.jobType ?? null,
      experience: legacy.experience ?? null,
      skills: legacy.skills ?? null,
      emailDomain: legacy.emailDomain ?? null,
      description: legacy.description ?? null,
      status: legacy.status ?? "Applied",
      dateAdded: legacy.dateAdded ?? new Date().toISOString().slice(0, 10),
      dateApplied: legacy.dateAdded ?? null,
    }, "import");
    if (legacy.id !== undefined) jobIdMap.set(String(legacy.id), job.id);
    imported++;
  }

  let importedCvs = 0;
  if (Array.isArray(body.cvs)) {
    const existing = new Set(listCvVersions().map((c) => `${c.name}::${c.family}`));
    for (const cv of body.cvs) {
      if (!cv.name || !cv.content || !cv.family || !CV_FAMILIES.includes(cv.family as never)) continue;
      if (cv.name.length > 300 || cv.content.length > 100_000) continue;
      const key = `${cv.name}::${cv.family}`;
      if (existing.has(key)) continue;
      createCvVersion({
        name: cv.name,
        family: cv.family as typeof CV_FAMILIES[number],
        summary: cv.summary,
        content: cv.content,
      });
      existing.add(key);
      importedCvs++;
    }
  }

  if (body.profile !== undefined) {
    const profile = profileSchema.safeParse(body.profile);
    if (!profile.success) {
      return NextResponse.json({ error: "Backup profile is invalid" }, { status: 400 });
    }
    setSetting("profile", profile.data);
  }

  if (typeof body.cvStyleGuide === "string") {
    if (body.cvStyleGuide.length > 100_000) {
      return NextResponse.json({ error: "CV style guide is too large" }, { status: 413 });
    }
    setSetting("cvStyleGuide", body.cvStyleGuide);
  }

  if (typeof body.syncIntervalMinutes === "number" && Number.isFinite(body.syncIntervalMinutes)) {
    setSetting("syncIntervalMinutes", Math.min(720, Math.max(5, Math.round(body.syncIntervalMinutes))));
  }

  let importedHistory = 0;
  if (Array.isArray(body.statusHistory)) {
    const db = getDb();
    const insert = db.prepare(
      "INSERT INTO status_history (jobId, fromStatus, toStatus, source, note, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const hasHistory = db.prepare("SELECT 1 FROM status_history WHERE jobId = ? AND toStatus = ? AND createdAt = ? LIMIT 1");
    for (const item of body.statusHistory) {
      const jobId = item.jobId === undefined ? undefined : jobIdMap.get(String(item.jobId));
      if (!jobId || !item.toStatus) continue;
      const createdAt = item.createdAt ?? new Date().toISOString();
      if (hasHistory.get(jobId, item.toStatus, createdAt)) continue;
      insert.run(jobId, item.fromStatus ?? null, item.toStatus, item.source ?? "import", item.note ?? null, createdAt);
      importedHistory++;
    }
  }

  return NextResponse.json({ imported, skipped, importedCvs, importedHistory });
}
