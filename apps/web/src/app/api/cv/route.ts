import { NextRequest, NextResponse } from "next/server";
import { CV_FAMILIES } from "@jobtrackr/core";
import { createCvVersion, listCvVersions } from "@/lib/cv";

export async function GET(){return NextResponse.json({cvs:listCvVersions()});}
export async function POST(req:NextRequest){
  const body=await req.json() as {name?:string;family?:string;summary?:string;content?:string};
  if(!body.name?.trim() || !body.family || !CV_FAMILIES.includes(body.family as never)) return NextResponse.json({error:"Name and a valid CV family are required."},{status:400});
  return NextResponse.json({cv:createCvVersion({name:body.name.trim(),family:body.family as typeof CV_FAMILIES[number],summary:body.summary,content:body.content})},{status:201});
}
