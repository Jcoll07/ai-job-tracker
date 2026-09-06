import { NextRequest, NextResponse } from "next/server";
import { disconnectGmail, gmailConnected } from "@/lib/gmail";
import { syncGmailBatch, getGmailSyncState } from "@/lib/gmail-batch";
import { deleteSetting, getSetting, setSetting } from "@/lib/db";

export const maxDuration = 60;
let syncWorkerRunning = false;

function isLocalRequest(req: NextRequest): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const hostname = host.split(":")[0].toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function workerSetting(): { running?: boolean; startedAt?: string; finishedAt?: string } | null {
  return getSetting("gmailSyncWorker");
}

function statusPayload() {
  return {
    syncing: syncWorkerRunning || Boolean(workerSetting()?.running),
    state: getGmailSyncState(),
    result: getSetting("gmailLastSyncResult"),
    error: getSetting("gmailSyncError"),
  };
}

function startWorker() {
  if (syncWorkerRunning || !gmailConnected()) return;
  void runWorker();
}

async function runWorker() {
  if (syncWorkerRunning || !gmailConnected()) return;
  syncWorkerRunning = true;
  setSetting("gmailSyncWorker", { running: true, startedAt: new Date().toISOString() });
  deleteSetting("gmailSyncError");
  try {
    for (let i = 0; i < 2000; i++) {
      const result = await syncGmailBatch();
      setSetting("gmailLastSyncResult", { at: new Date().toISOString(), ...result });
      if (result.done) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  } catch (err) {
    setSetting("gmailSyncError", { at: new Date().toISOString(), error: err instanceof Error ? err.message : "Sync failed" });
  } finally {
    syncWorkerRunning = false;
    setSetting("gmailSyncWorker", { running: false, finishedAt: new Date().toISOString() });
  }
}

export async function POST(req: NextRequest) {
  if (!isLocalRequest(req)) return NextResponse.json({ error: "Manual Gmail sync is available only from the local app." }, { status: 403 });
  if (!gmailConnected()) return NextResponse.json({ error: "Gmail is not connected" }, { status: 409 });

  const persisted = workerSetting();
  if (!syncWorkerRunning && !persisted?.running) startWorker();

  return NextResponse.json({ started: true, ...statusPayload() });
}

export async function GET(req: NextRequest) {
  if (!isLocalRequest(req)) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // If the browser navigated away while the local worker was still running, a later
  // page load can resume the persisted queue instead of leaving the UI at 0/0 forever.
  const persisted = workerSetting();
  const state = getGmailSyncState() as { queue?: unknown[] } | null;
  if (gmailConnected() && persisted?.running && !syncWorkerRunning) startWorker();
  else if (gmailConnected() && !persisted?.running && Array.isArray(state?.queue) && state.queue.length > 0) startWorker();

  return NextResponse.json(statusPayload());
}

export async function DELETE(req: NextRequest) {
  if (!isLocalRequest(req)) return NextResponse.json({ error: "Gmail disconnect is available only from the local app." }, { status: 403 });
  disconnectGmail();
  syncWorkerRunning = false;
  deleteSetting("gmailSyncState");
  deleteSetting("gmailSyncWorker");
  deleteSetting("gmailSyncError");
  return NextResponse.json({ ok: true });
}
