"use client";
import { useEffect, useState } from "react";
import { CV_FAMILIES, type CvFamily, type CvVersion, type Job } from "@jobtrackr/core";
import { api } from "@/lib/client";

export default function CvPage(){
  const [cvs,setCvs]=useState<CvVersion[]>([]); const [jobs,setJobs]=useState<Job[]>([]); const [selected,setSelected]=useState<CvVersion|null>(null);
  const [name,setName]=useState(""); const [family,setFamily]=useState<CvFamily>("General Engineering"); const [summary,setSummary]=useState(""); const [content,setContent]=useState("");
  const [jobId,setJobId]=useState(""); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState<string|null>(null);
  async function load(){const [c,j]=await Promise.all([api<{cvs:CvVersion[]}>("/api/cv"),api<{jobs:Job[]}>("/api/jobs?sort=updatedAt")]);setCvs(c.cvs);setJobs(j.jobs);}
  useEffect(()=>{load().catch(()=>{});},[]);
  function edit(cv:CvVersion){setSelected(cv);setName(cv.name);setFamily(cv.family);setSummary(cv.summary);setContent(cv.content);setNotice(null);}
  function fresh(){setSelected(null);setName("");setFamily("General Engineering");setSummary("");setContent("");setNotice(null);}
  async function save(){if(!name.trim())return;setBusy(true);try{if(selected){const r=await api<{cv:CvVersion}>(`/api/cv/${selected.id}`,{method:"PATCH",json:{name:name.trim(),family,summary,content}});setSelected(r.cv);}else{const r=await api<{cv:CvVersion}>("/api/cv",{method:"POST",json:{name:name.trim(),family,summary,content}});setSelected(r.cv);}await load();setNotice("Saved.");}catch(e){setNotice(e instanceof Error?e.message:"Save failed");}finally{setBusy(false);}}
  async function remove(){if(!selected||!confirm("Delete this CV version?"))return;await api(`/api/cv/${selected.id}`,{method:"DELETE"});fresh();await load();}
  async function tailor(){if(!jobId)return;setBusy(true);setNotice(null);try{const r=await api<{cv:CvVersion}>(`/api/jobs/${jobId}/cv-tailor`,{method:"POST",json:{cvVersionId:selected?.id}});await load();edit(r.cv);setNotice("Tailored CV created as a new version. Review every line before using it.");}catch(e){setNotice(e instanceof Error?e.message:"Tailoring failed");}finally{setBusy(false);}}
  function print(){if(!content.trim())return;const w=window.open("","_blank","width=900,height=1100");if(!w)return;const esc=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");w.document.write(`<html><head><title>${esc(name)}</title><style>body{font-family:Arial,sans-serif;max-width:780px;margin:45px auto;line-height:1.45;color:#111;white-space:pre-wrap}h1{font-size:25px}@media print{body{margin:25mm 20mm}}</style></head><body><h1>${esc(name)}</h1><div>${esc(content)}</div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}
  return <div><div className="row"><div><h1 style={{marginBottom:4}}>CV Manager</h1><p className="muted" style={{marginTop:0}}>Master CV versions by target family. Tailoring creates a new version and never overwrites the source.</p></div><div className="spacer"/><button className="btn" onClick={fresh}>+ New CV</button></div>
    {notice&&<div className="notice ok">{notice}</div>}
    <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:16}}>
      <div className="card"><strong>Versions</strong>{cvs.length?cvs.map(cv=><button key={cv.id} onClick={()=>edit(cv)} style={{display:"block",width:"100%",textAlign:"left",padding:10,marginTop:8,border:"1px solid var(--border)",borderRadius:8,background:selected?.id===cv.id?"var(--surface-2)":"transparent",color:"inherit",cursor:"pointer"}}><strong>{cv.name}</strong><div className="muted" style={{fontSize:12}}>{cv.family}</div></button>):<p className="muted">No versions yet.</p>}</div>
      <div className="card"><div className="form-grid"><div className="field"><label>Name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Product Engineer — Base"/></div><div className="field"><label>Family</label><select value={family} onChange={e=>setFamily(e.target.value as CvFamily)}>{CV_FAMILIES.map(f=><option key={f}>{f}</option>)}</select></div></div>
        <div className="field" style={{marginTop:12}}><label>Summary / purpose</label><input value={summary} onChange={e=>setSummary(e.target.value)} placeholder="When this version should be used"/></div>
        <div className="field" style={{marginTop:12}}><label>CV source text</label><textarea rows={24} value={content} onChange={e=>setContent(e.target.value)} placeholder="Paste your factual CV source here. This is the material the tailoring model is allowed to use."/></div>
        <div className="row" style={{marginTop:12}}><button className="btn primary" disabled={busy||!name.trim()} onClick={save}>{busy?"Working…":"Save version"}</button>{selected&&<button className="btn danger" onClick={remove}>Delete</button>}<button className="btn" disabled={!content.trim()} onClick={print}>Print / Save PDF</button><div className="spacer"/></div>
        <hr style={{border:0,borderTop:"1px solid var(--border)",margin:"18px 0"}}/><strong>Tailor to a tracked job</strong><div className="row" style={{marginTop:8}}><select style={{flex:1}} value={jobId} onChange={e=>setJobId(e.target.value)}><option value="">Select a job…</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.company} — {j.jobTitle}</option>)}</select><button className="btn primary" disabled={busy||!jobId||!selected} onClick={tailor}>AI tailor → new version</button></div>
      </div>
    </div>
  </div>;
}
