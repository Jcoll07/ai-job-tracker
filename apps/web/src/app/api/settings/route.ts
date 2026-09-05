import { NextRequest, NextResponse } from "next/server";
import { aiAvailable } from "@/lib/ai";
import { getSetting, setSetting } from "@/lib/db";
import {
  getExtensionToken,
  regenerateExtensionToken,
} from "@/lib/extension-auth";
import { gmailConfigured, gmailConnected } from "@/lib/gmail";

const DEFAULT_SYNC_INTERVAL_MIN = 30;

function isLocalRequest(req: NextRequest): boolean {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const hostname = host.split(":")[0].toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export async function GET(req: NextRequest) {
  const local = isLocalRequest(req);
  return NextResponse.json({
    aiConfigured: aiAvailable(),
    gmailConfigured: gmailConfigured(),
    gmailConnected: gmailConnected(),
    extensionToken: local ? getExtensionToken() : undefined,
    appUrl: process.env.APP_URL || "http://localhost:3001",
    syncIntervalMinutes:
      getSetting<number>("syncIntervalMinutes") ?? DEFAULT_SYNC_INTERVAL_MIN,
  });
}

export async function POST(req: NextRequest) {
  if (!isLocalRequest(req)) {
    return NextResponse.json(
      { error: "Settings mutations are available only from the local app." },
      { status: 403 },
    );
  }

  const { action, minutes } = (await req.json()) as {
    action?: string;
    minutes?: number;
  };

  if (action === "regenerateExtensionToken") {
    return NextResponse.json({ extensionToken: regenerateExtensionToken() });
  }

  if (action === "setSyncInterval") {
    if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
      return NextResponse.json({ error: "minutes must be a number" }, { status: 400 });
    }
    const clamped = Math.min(720, Math.max(5, Math.round(minutes)));
    setSetting("syncIntervalMinutes", clamped);
    return NextResponse.json({ syncIntervalMinutes: clamped });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
