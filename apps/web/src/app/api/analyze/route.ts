import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aiAvailable, parseJobPosting } from "@/lib/ai";
import { fetchJobPosting } from "@/lib/fetch-job";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 120_000;
const inputSchema = z.object({ url: z.string().url().optional(), text: z.string().max(MAX_TEXT_CHARS).optional() }).strict();

function aiFailureStatus(err: unknown): number { const message=err instanceof Error?err.message:String(err); return /Local AI request failed \(HTTP (401|403|404|408|429|500|502|503|504)\)|fetch failed|ECONNREFUSED|ETIMEDOUT|UND_ERR/i.test(message)?503:502; }

export async function POST(req: NextRequest) {
  const length=Number(req.headers.get("content-length")??0);
  if(Number.isFinite(length)&&length>MAX_BODY_BYTES)return NextResponse.json({error:"Request body is too large"},{status:413});
  let body:unknown; try{body=await req.json()}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}
  const parsed=inputSchema.safeParse(body);
  if(!parsed.success||(!parsed.data.url&&!parsed.data.text))return NextResponse.json({error:"Provide a job posting 'url' or pasted 'text'"},{status:400});
  try{
    if(parsed.data.url){
      const scraped=await fetchJobPosting(parsed.data.url);
      if(!scraped.open)return NextResponse.json({error:"Job posting is no longer open"},{status:410});
      if(scraped.structuredJob)return NextResponse.json({parsed:{...scraped.structuredJob,sourceUrl:scraped.url},usedAI:false},{headers:{"Cache-Control":"no-store"}});
      if(!aiAvailable())return NextResponse.json({error:"This page does not expose structured job data. Use Copy & Paste, or configure the local AI provider for fallback parsing."},{status:503});
      const job=await parseJobPosting(scraped.content);
      return NextResponse.json({parsed:{...job,sourceUrl:scraped.url},usedAI:true},{headers:{"Cache-Control":"no-store"}});
    }
    if(!aiAvailable())return NextResponse.json({error:"AI provider is not configured"},{status:503});
    const job=await parseJobPosting(parsed.data.text!);
    return NextResponse.json({parsed:{...job,sourceUrl:null},usedAI:true},{headers:{"Cache-Control":"no-store"}});
  }catch(err){return NextResponse.json({error:err instanceof Error?err.message:"Analysis failed"},{status:aiFailureStatus(err)})}
}
