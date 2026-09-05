import { NextResponse } from "next/server";
import { listJobs } from "@/lib/jobs"; import { listCvVersions } from "@/lib/cv";
export async function GET(){const jobs=listJobs();const cvs=listCvVersions();return new NextResponse(JSON.stringify({jobs,cvs,exportDate:new Date().toISOString(),version:"2.1",totalJobs:jobs.length,totalCvs:cvs.length},null,2),{headers:{"content-type":"application/json","content-disposition":`attachment; filename="job-tracker-backup-${new Date().toISOString().slice(0,10)}.json"`}});}
