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

async function runBatch() {
  if (!gmailConnected()) return NextResponse.json({ error: "Gmail is not connected" }, { status: 409 });
  try {
    return NextResponse.json({ result: await syncGmailBatch() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 502 });
  }
}

async function runWorker() {
  if (syncWorkerRunning) return;
  syncWorkerRunning = true;
  setSetting("gmailSyncWorker", { running: true, startedAt: new Date().toISOString() });
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
  if (!syncWorkerRunning) void runWorker();
  return NextResponse.json({
    started: true,
    syncing: true,
    state: getGmailSyncState(),
    result: getSetting("gmailLastSyncResult"),
    error: getSetting("gmailSyncError"),
  });
}

export async function GET(req: NextRequest) {
  if (!isLocalRequest(req)) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    syncing: syncWorkerRunning || Boolean((getSetting<any>("gmailSyncWorker") ?? {}).running),
    state: getGmailSyncState(),
    result: getSetting("gmailLastSyncResult"),
    error: getSetting("gmailSyncError"),
  });
}

export async function DELETE(req: NextRequest) {
  if (!isLocalRequest(req)) return NextResponse.json({ error: "Gmail disconnect is available only from the local app." }, { status: 403 });
  disconnectGmail();
  deleteSetting("gmailSyncState");
  deleteSetting("gmailSyncWorker");
  deleteSetting("gmailSyncError");
  return NextResponse.json({ ok: true });
}
