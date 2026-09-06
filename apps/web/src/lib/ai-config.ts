import { getSetting, setSetting } from "./db";

export const AI_TASKS = {
  jobAnalysis: { label: "Job analysis", description: "Extract and analyse job postings", defaultKind: "reasoning" },
  gmailClassification: { label: "Gmail classification", description: "Classify hiring emails", defaultKind: "fast" },
  applicationAnswers: { label: "Application answers", description: "Draft answers to application questions", defaultKind: "reasoning" },
  cvTailoring: { label: "CV tailoring", description: "Adapt CVs to a target vacancy", defaultKind: "powerful" },
  development: { label: "Development / automation", description: "Future coding and automation tasks", defaultKind: "code" },
} as const;
export type AiTask = keyof typeof AI_TASKS;
export interface AiModel { id: string; owned_by?: string; object?: string; }
export type AiModelKind = "fast" | "reasoning" | "code" | "powerful";
export interface AiModelSettings { models: Partial<Record<AiTask, string>>; fallbackNotice?: { task: AiTask; missingModel: string; selectedModel: string; at: string } | null; }
const ENV_DEFAULT = process.env.AI_MODEL || "Qwen2.5.1-Coder-7B-Instruct-4bit";
const FALLBACK_PREFERENCE: Record<AiModelKind, RegExp[]> = { fast: [/7b/i, /mini/i, /small/i], reasoning: [/qwen3/i, /reason/i, /thinking/i, /14b/i], code: [/coder/i, /code/i], powerful: [/qwen3/i, /14b/i, /32b/i, /70b/i] };
export function localBaseUrl(): string { return (process.env.AI_BASE_URL || "http://127.0.0.1:8000/v1").replace(/\/$/, ""); }
export function localApiKey(): string { return process.env.AI_API_KEY || process.env.OMLX_API_KEY || ""; }
export async function discoverLocalModels(): Promise<AiModel[]> { const headers: Record<string,string>={}; const key=localApiKey(); if(key) headers.authorization=`Bearer ${key}`; const res=await fetch(`${localBaseUrl()}/models`,{headers,signal:AbortSignal.timeout(10000),cache:"no-store"}); if(!res.ok) throw new Error(`Local model discovery failed (HTTP ${res.status})`); const data=await res.json() as {data?:AiModel[]}; return (data.data||[]).filter((m)=>typeof m?.id==="string"&&m.id.trim()); }
function defaultForKind(models:AiModel[],kind:AiModelKind):string|null { const scored=models.map(m=>({id:m.id,score:FALLBACK_PREFERENCE[kind].reduce((n,r,i)=>n+(r.test(m.id)?10-i:0),0)})); scored.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)); return scored[0]?.id||null; }
function taskDefault(task:AiTask,models:AiModel[]):string|null { return defaultForKind(models,AI_TASKS[task].defaultKind) || (models.some(m=>m.id===ENV_DEFAULT)?ENV_DEFAULT:null); }
export function getAiModelSettings():AiModelSettings { return getSetting<AiModelSettings>("aiModelSettings") || {models:{},fallbackNotice:null}; }
export function saveAiModel(task:AiTask,model:string):AiModelSettings { const current=getAiModelSettings(); const next={...current,models:{...current.models,[task]:model},fallbackNotice:null}; setSetting("aiModelSettings",next); return next; }
export function reconcileAiModelSettings(models:AiModel[]):{settings:AiModelSettings;changed:boolean} { const current=getAiModelSettings(); const available=new Set(models.map(m=>m.id)); const nextModels={...current.models}; let changed=false; let notice=current.fallbackNotice??null; (Object.keys(AI_TASKS) as AiTask[]).forEach(task=>{const selected=nextModels[task]; if(!selected){const chosen=taskDefault(task,models); if(chosen){nextModels[task]=chosen;changed=true;}} else if(!available.has(selected)){const chosen=taskDefault(task,models); if(chosen&&chosen!==selected){nextModels[task]=chosen;notice={task,missingModel:selected,selectedModel:chosen,at:new Date().toISOString()};changed=true;}}}); const settings={models:nextModels,fallbackNotice:notice}; if(changed)setSetting("aiModelSettings",settings); return {settings,changed}; }
export function modelForTask(task:AiTask):string { return getAiModelSettings().models[task]||ENV_DEFAULT; }
