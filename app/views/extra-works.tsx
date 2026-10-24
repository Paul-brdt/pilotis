"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type ExtraWork = {
  id: string;
  subject: string;
  hours: number | string | null;
  materials: string | null;
  comments: string | null;
  created_at: string;
  updated_at: string;
};

export function ExtraWorksManager({ accessToken, toast }: { accessToken:string; toast:(message:string)=>void }) {
  const [works,setWorks]=useState<ExtraWork[]>([]),[selected,setSelected]=useState<ExtraWork|null>(null),[query,setQuery]=useState(""),[showForm,setShowForm]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
  async function load(){const db=createSupabaseBrowserClient();const {data:project}=await db.from("projects").select("id").eq("code","24-018").single();if(!project)return;const {data}=await db.from("extra_works").select("id,subject,hours,materials,comments,created_at,updated_at").eq("project_id",project.id).order("updated_at",{ascending:false});setWorks((data||[]) as ExtraWork[])}
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer)},[]);
  const filtered=useMemo(()=>works.filter(work=>`${work.subject} ${work.materials||""} ${work.comments||""}`.toLowerCase().includes(query.toLowerCase())),[works,query]);
  async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setError("");const form=new FormData(event.currentTarget);try{const response=await fetch("/api/operations",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${accessToken}`},body:JSON.stringify({kind:selected?"extra-work-update":"extra-work-create",extraWorkId:selected?.id,subject:form.get("subject"),hours:form.get("hours")?Number(form.get("hours")):null,materials:form.get("materials"),comments:form.get("comments")})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Enregistrement impossible");toast(selected?"Travaux supplémentaires mis à jour":"Travaux supplémentaires ajoutés");setShowForm(false);setSelected(null);await load()}catch(e){setError(e instanceof Error?e.message:"Erreur")}finally{setSaving(false)}}
  function edit(work:ExtraWork){setSelected(work);setError("");setShowForm(true)}
  return <div className="content page-content extra-works-page"><div className="page-head"><div><h2>Travaux supplémentaires</h2><p>Listez rapidement une demande, puis complétez ses heures, matériels et commentaires au fil du chantier.</p></div><button className="primary" onClick={()=>{setSelected(null);setError("");setShowForm(true)}}>＋ Ajouter</button></div>
    <div className="panel extra-works-panel"><div className="filters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="⌕ Rechercher un objet, un matériel…"/></div><div className="stock-table-scroll"><table><thead><tr><th>OBJET</th><th>HEURES</th><th>MATÉRIEL</th><th>COMMENTAIRES</th><th>MISE À JOUR</th><th></th></tr></thead><tbody>{filtered.length?filtered.map(work=><tr key={work.id} onClick={()=>edit(work)}><td><b>{work.subject}</b></td><td>{work.hours===null?"—":`${Number(work.hours).toLocaleString("fr-FR")} h`}</td><td className="extra-work-text">{work.materials||"—"}</td><td className="extra-work-text">{work.comments||"—"}</td><td>{new Date(work.updated_at).toLocaleDateString("fr-FR")}</td><td><button onClick={event=>{event.stopPropagation();edit(work)}}>Modifier</button></td></tr>):<tr><td colSpan={6} className="empty-table">Aucun travail supplémentaire enregistré.</td></tr>}</tbody></table></div></div>
    {showForm&&<div className="modal-backdrop"><form className="task-modal extra-work-modal" onSubmit={submit}><div className="modal-title"><div><span>TRAVAUX SUPPLÉMENTAIRES</span><h3>{selected?"Modifier la demande":"Nouvelle demande"}</h3></div><button type="button" onClick={()=>{setShowForm(false);setSelected(null)}}>×</button></div><label>Objet<input name="subject" required autoFocus defaultValue={selected?.subject||""} placeholder="Ex. Ajout d’un départ électrique"/></label><label>Heures <small>(facultatif)</small><input name="hours" type="number" min="0" step="0.25" defaultValue={selected?.hours===null?"":Number(selected?.hours||"")}/></label><label>Matériel <small>(facultatif)</small><textarea name="materials" defaultValue={selected?.materials||""} placeholder="Références, quantités ou besoins…"/></label><label>Commentaires <small>(facultatif)</small><textarea name="comments" defaultValue={selected?.comments||""} placeholder="Précisions, demande client, contraintes…"/></label>{error?<div className="settings-error">{error}</div>:null}<div className="modal-actions"><button type="button" onClick={()=>{setShowForm(false);setSelected(null)}}>Annuler</button><button className="primary" disabled={saving}>{saving?"Enregistrement…":"Enregistrer"}</button></div></form></div>}
  </div>
}
