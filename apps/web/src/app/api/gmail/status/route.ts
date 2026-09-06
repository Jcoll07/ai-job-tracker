import { NextResponse } from "next/server";
import { getDb, getSetting } from "@/lib/db";
import { gmailConfigured, gmailConnected } from "@/lib/gmail";

export async function GET() {
  const database = getDb();
  const row = database.prepare("SELECT COUNT(*) AS count FROM emails WHERE gmailId IS NOT NULL AND jobId IS NOT NULL").get() as { count: number };
  const historicalLinkedMessages = Number(row?.count ?? 0);

  return NextResponse.json({
    configured: gmailConfigured(),
    connected: gmailConnected(),
    lastSync: getSetting("gmailLastSyncResult"),
    lastSuccessfulSync: getSetting("gmailLastSuccessfulSyncResult"),
    historicalLinkedMessages,
    hasHistoricalLinkedMessage: historicalLinkedMessages > 0,
  });
}
