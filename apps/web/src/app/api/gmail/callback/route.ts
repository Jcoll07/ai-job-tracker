import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  // Do not redirect malformed callbacks. OAuth callbacks are server-to-server
  // protocol endpoints and invalid input should terminate with a clear 4xx.
  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing OAuth code or state" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const base = process.env.APP_URL || "http://localhost:3001";
  try {
    await exchangeCode(code, state);
    return NextResponse.redirect(`${base}/settings?gmail=connected`, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("Gmail OAuth callback failed:", err);
    return NextResponse.redirect(`${base}/settings?gmail=error`, {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
