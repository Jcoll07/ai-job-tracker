import { NextRequest, NextResponse } from "next/server";
import { disconnectGmail, gmailConnected } from "@/lib/gmail";
import { syncGmailBatch } from "@/lib/gmail-batch";
import { deleteSetting } from "@/lib/db";

export const maxDuration = 60;
function isLocalRequest(req: NextRequest): boolean { const host=req.headers.get("x-forwarded-host")??req.headers.get("host")??""; const hostname=host.split(":")[0].toLowerCase(); return hostname==="localhost"||hostname==="127.0.0.1"||hostname==="[::1]"; }
async function runBatch(){if(!gmailConnected())return NextResponse.json({error:"Gmail is not connected"},{status:409});try{return NextResponse.json({result:await syncGmailBatch()})}catch(err){return NextResponse.json({error:err instanceof Error?err.message:"Sync failed"},{status:502})}}
export async function POST(req:NextRequest){if(!isLocalRequest(req))return NextResponse.json({error:"Manual Gmail sync is available only from the local app."},{status:403});return runBatch()}
export async function GET(req:NextRequest){const secret=process.env.CRON_SECRET;if(!secret||req.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});return runBatch()}
export async function DELETE(req:NextRequest){if(!isLocalRequest(req))return NextResponse.json({error:"Gmail disconnect is available only from the local app."},{status:403});disconnectGmail();deleteSetting("gmailSyncState");return NextResponse.json({ok:true})}
