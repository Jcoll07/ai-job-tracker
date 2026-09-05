import fs from "node:fs";
import path from "node:path";
import type { CvFamily, CvVersion } from "@jobtrackr/core";
import { getDb } from "./db";

const FILE_DIR = path.join(process.cwd(), "data", "cv");
function safeName(name: string): string { return name.replace(/[/\\:*?"<>|]/g, "_").slice(0, 120); }
export function listCvVersions(): CvVersion[] { return getDb().prepare("SELECT * FROM cv_versions ORDER BY active DESC, updatedAt DESC, id DESC").all() as CvVersion[]; }
export function getCvVersion(id: number): CvVersion | null { return (getDb().prepare("SELECT * FROM cv_versions WHERE id=?").get(id) as CvVersion) ?? null; }
export function createCvVersion(input: {name:string;family:CvFamily;summary?:string;content?:string;fileName?:string|null}): CvVersion {
  const now=new Date().toISOString(); const r=getDb().prepare("INSERT INTO cv_versions(name,family,summary,content,fileName,createdAt,updatedAt,active) VALUES(?,?,?,?,?,?,?,1)").run(input.name,input.family,input.summary??"",input.content??"",input.fileName??null,now,now,1); return getCvVersion(Number(r.lastInsertRowid))!;
}
export function updateCvVersion(id:number, patch:Partial<Pick<CvVersion,"name"|"family"|"summary"|"content"|"fileName"|"active">>):CvVersion|null {
  const current=getCvVersion(id); if(!current)return null; const keys=Object.keys(patch) as Array<keyof typeof patch>; if(!keys.length)return current;
  const params:Record<string,unknown>={id,updatedAt:new Date().toISOString()}; const sets:string[]=[];
  for(const key of keys){sets.push(`${key}=@${key}`);params[key]=patch[key]??null;} sets.push("updatedAt=@updatedAt"); getDb().prepare(`UPDATE cv_versions SET ${sets.join(",")} WHERE id=@id`).run(params); return getCvVersion(id);
}
export function deleteCvVersion(id:number):boolean { const cv=getCvVersion(id); if(!cv)return false; if(cv.fileName){const p=path.join(FILE_DIR,cv.fileName);if(fs.existsSync(p))fs.unlinkSync(p);} return getDb().prepare("DELETE FROM cv_versions WHERE id=?").run(id).changes>0; }
export function saveCvFile(id:number, originalName:string, data:Buffer):CvVersion|null {
  const cv=getCvVersion(id); if(!cv)return null; fs.mkdirSync(FILE_DIR,{recursive:true}); const ext=path.extname(originalName).toLowerCase(); const name=safeName(`cv-${id}${ext}`); const p=path.join(FILE_DIR,name);
  if(cv.fileName && cv.fileName!==name){const old=path.join(FILE_DIR,cv.fileName);if(fs.existsSync(old))fs.unlinkSync(old);} fs.writeFileSync(p,data); return updateCvVersion(id,{fileName:name});
}
export function getCvFile(id:number):{path:string;name:string}|null { const cv=getCvVersion(id); if(!cv?.fileName)return null; const p=path.join(FILE_DIR,cv.fileName); return fs.existsSync(p)?{path:p,name:cv.fileName}:null; }
