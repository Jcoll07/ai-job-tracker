import { NextRequest, NextResponse } from "next/server";
import { EMPTY_PROFILE } from "@jobtrackr/core";
import { getSetting } from "@/lib/db";
import { getJob } from "@/lib/jobs";
import { getCvVersion } from "@/lib/cv";
import { calculateFit } from "@/lib/fit";

export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){const id=Number((await params).id);const job=getJob(id);if(!job)return NextResponse.json({error:"Not found"},{status:404});const profile=getSetting("profile")??EMPTY_PROFILE;const cv=job.cvVersionId?getCvVersion(job.cvVersionId):null;return NextResponse.json({fit:calculateFit(job,profile,cv),cv});}
