import type { FitScore, Job, Profile, CvFamily, CvVersion } from "@jobtrackr/core";

const FAMILY_TERMS: Record<CvFamily,string[]> = {
  "Product Engineer":["product engineer","product","roadmap","requirements","stakeholder","technical product"],
  "Process Engineer":["process engineer","process improvement","lean","six sigma","continuous improvement","process"],
  "Industrialisation Engineer":["industrialization","industrialisation","manufacturing","production","industrial engineer","industrialisation"],
  "R&D / Solution Architect":["r&d","research and development","solution architect","solutions architect","systems architect","technical architect"],
  "Automation Engineer":["automation engineer","plc","codesys","tia portal","scada","controls engineer","automation"],
  "General Engineering":["engineer","engineering","technical","project engineer"],
};
const TECH_TERMS=["python","c++","matlab","excel","sql","plc","codesys","tia portal","autocad","rhino","linux","git","docker","api","rest","sap","crm","six sigma","lean","risk assessment","commissioning","troubleshooting","maintenance","installation","r&d","systems engineering","project management"];
function words(s:string):string[]{return s.toLowerCase().replace(/[^a-z0-9+#.&/-]+/g," ").split(/\s+/).filter(Boolean);}
function has(hay:string, needle:string):boolean{return hay.toLowerCase().includes(needle.toLowerCase());}
function termsFromJob(job:Job):string[]{return `${job.jobTitle} ${job.skills??""} ${job.experience??""} ${job.description??""}`.toLowerCase();}
function detectFamily(job:Job):CvFamily{const text=termsFromJob(job);let best:"Product Engineer"|"Process Engineer"|"Industrialisation Engineer"|"R&D / Solution Architect"|"Automation Engineer"|"General Engineering"="General Engineering";let score=-1;for(const [family,terms] of Object.entries(FAMILY_TERMS) as Array<[CvFamily,string[]]>){const n=terms.filter(t=>has(text,t)).length;if(n>score){score=n;best=family;}}return best;}
function overlap(required:string[], source:string):{hit:string[];miss:string[]}{const hit:string[]=[];const miss:string[]=[];for(const t of required){if(has(source,t))hit.push(t);else miss.push(t);}return {hit,miss};}
export function calculateFit(job:Job, profile:Profile, cv?:CvVersion|null):FitScore {
  const source=`${profile.currentTitle} ${profile.currentCompany} ${profile.yearsOfExperience} ${profile.background} ${profile.customAnswers.map(x=>`${x.question} ${x.answer}`).join(" ")} ${cv?.content??""}`.toLowerCase();
  const text=termsFromJob(job); const family=detectFamily(job); const familyTerms=FAMILY_TERMS[family];
  const techReq=TECH_TERMS.filter(t=>has(text,t)); const tech=overlap(techReq,source);
  const expMatch=/([0-9]+)\+?\s*(?:years|yrs)/i.exec(job.experience??job.description??""); const yearsUser=parseFloat(profile.yearsOfExperience)||0; const yearsReq=expMatch?Number(expMatch[1]):0;
  const experience=yearsReq?Math.min(100,yearsUser>=yearsReq?100:Math.round((yearsUser/yearsReq)*100)):70;
  const technical=techReq.length?Math.round(100*tech.hit.length/techReq.length):70;
  const familyHit=familyTerms.filter(t=>has(source,t)).length; const industry=has(source,"maritime")&&has(text,"maritime")||has(source,"marine")&&has(text,"marine")?100:60;
  const education=has(source,"engineer")||has(source,"engineering")?85:50;
  const location=job.location?.toLowerCase().includes("remote")?100:70;
  const seniority=has(text,"senior")&&yearsUser>=5?100:has(text,"mid")&&yearsUser>=3?90:has(text,"junior")&&yearsUser<=3?100:75;
  const rationale=[`Profile family selected: ${family}.`,`Technical keyword coverage: ${tech.hit.length}/${Math.max(techReq.length,1)}.`,`Experience requirement: ${yearsReq?`${yearsReq}+ years requested vs ${yearsUser||0} years in profile.`:"No explicit years requirement found."}`];
  const strengths=[...tech.hit.slice(0,6),...(familyHit?[`Relevant ${family} terminology`]:[])];
  const partial=[...tech.miss.slice(0,6)];
  const gaps=[...tech.miss.slice(6),...(yearsReq&&yearsUser<yearsReq?[`Below stated experience requirement (${yearsReq}+ years)`]:[])];
  const score=Math.round(experience*.22+technical*.28+industry*.15+education*.10+location*.10+seniority*.15);
  return {score,family,experience,technical,industry,education,location,seniority,strengths,partial,gaps,rationale};
}
export function chooseCv(job:Job, cvs:CvVersion[], profile:Profile):CvVersion|null{if(!cvs.length)return null;const fit=calculateFit(job,profile);return cvs.find(c=>c.family===fit.family&&c.active) ?? cvs.find(c=>c.active) ?? cvs[0];}
