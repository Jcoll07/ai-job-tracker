import { NextRequest,NextResponse } from "next/server";
import { newJobSchema,EMPTY_PROFILE,type Profile } from "@jobtrackr/core";
import { createJob,findDuplicate,listJobs } from "@/lib/jobs";
import { getSetting } from "@/lib/db";
import { getJobContext } from "@/lib/gmail";
import { getCvVersion } from "@/lib/cv";
import { calculateFit } from "@/lib/fit";
export async function GET(req:NextRequest){const p=req.nextUrl.searchParams;const jobs=listJobs({search:p.get("search")??undefined,status:p.get("status")??undefined,from:p.get("from")??undefined,to:p.get("to")??undefined,sort:p.get("sort")??undefined,dir:(p.get("dir") as "asc"|"desc")??undefined});const profile=getSetting<Profile>("profile")??EMPTY_PROFILE;const enriched=jobs.map(job=>{const cv=job.cvVersionId?getCvVersion(job.cvVersionId):null;const fit=calculateFit(job,profile,cv);const context=getJobContext(job.id) as {matchScore?:number}|null;return{...job,fitScore:fit.score,personalizedJobContextScore:typeof context?.matchScore==="number"?Math.round(context.matchScore):null}});return NextResponse.json({jobs:enriched})}
export async function POST(req:NextRequest){const body=await req.json();const parsed=newJobSchema.safeParse(body);if(!parsed.success)return NextResponse.json({error:parsed.error.flatten()},{status:400});if(!body.allowDuplicate){const dup=findDuplicate(parsed.data.company,parsed.data.jobTitle);if(dup)return NextResponse.json({duplicate:dup},{status:409})}const job=createJob(parsed.data);return NextResponse.json({job},{status:201})}
