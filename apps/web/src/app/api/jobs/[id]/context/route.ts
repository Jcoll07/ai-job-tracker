import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";
import { getJobContext, setJobContext } from "@/lib/gmail";
import { EMPTY_PROFILE, type Profile } from "@jobtrackr/core";
import { getSetting } from "@/lib/db";
import { personalizeJob } from "@/lib/ai";

type Params={params:Promise<{id:string}>};
export async function GET(_req:NextRequest,{params}:Params){const id=Number((await params).id);if(!Number.isInteger(id)||id<1)return NextResponse.json({error:"Invalid job id"},{status:400});if(!getJob(id))return NextResponse.json({error:"Not found"},{status:404});return NextResponse.json({context:getJobContext(id)})}
export async function POST(_req:NextRequest,{params}:Params){const id=Number((await params).id);if(!Number.isInteger(id)||id<1)return NextResponse.json({error:"Invalid job id"},{status:400});const job=getJob(id);if(!job)return NextResponse.json({error:"Not found"},{status:404});const profile=getSetting<Profile>("profile")??EMPTY_PROFILE;try{const context=await personalizeJob({job,profile});setJobContext(id,context);return NextResponse.json({context})}catch(err){return NextResponse.json({error:err instanceof Error?err.message:"Context generation failed"},{status:502})}}
