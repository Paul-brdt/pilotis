"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export type AttendanceStatus = "non_renseigne" | "present" | "absent" | "conge" | "formation" | "maladie";
type Person = { id: string; full_name: string; qualification: string | null; contract_type: string };
export type WorkSchedule = { id?: string; project_id: string; weekday: number; is_working_day: boolean; start_time: string; end_time: string; break_minutes: number; theoretical_hours: number; updated_by?: string };
type Attendance = { id?: string; person_id: string; status: AttendanceStatus; arrival_time: string | null; departure_time: string | null; scheduled_hours: number; regular_hours: number; automatic_overtime_hours: number; manual_overtime_hours: number | null; created_by?: string };

const absenceReasons: Array<[AttendanceStatus, string]> = [["non_renseigne", "Choisir un motif…"], ["absent", "Absent"], ["conge", "Congé"], ["formation", "Formation"], ["maladie", "Maladie"]];
const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const shortTime = (value: string | null | undefined) => value ? value.slice(0, 5) : "";
const minutes = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };

export function calculateAttendance(schedule: WorkSchedule | undefined, status: AttendanceStatus, arrival: string, departure: string) {
  if (!schedule?.is_working_day || status !== "present") return { scheduled: 0, regular: 0, overtime: 0 };
  const scheduled = Number(schedule.theoretical_hours);
  if (!arrival || !departure) return { scheduled, regular: scheduled, overtime: 0 };
  const late = Math.max(0, minutes(arrival) - minutes(shortTime(schedule.start_time)));
  const early = Math.max(0, minutes(shortTime(schedule.end_time)) - minutes(departure));
  const overtime = Math.max(0, minutes(departure) - minutes(shortTime(schedule.end_time))) / 60;
  return { scheduled, regular: Math.max(0, scheduled - (late + early) / 60), overtime };
}

export function MorningPresence({ workDate, dateLabel, toast }: { workDate: string; dateLabel: string; toast: (message: string) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [schedule, setSchedule] = useState<WorkSchedule>();
  const [rows, setRows] = useState<Record<string, Attendance>>({});
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const db = createSupabaseBrowserClient();
    const [{ data: auth }, { data: project }] = await Promise.all([db.auth.getUser(), db.from("projects").select("id").eq("code", "24-018").single()]);
    if (!project || !auth.user) { setLoading(false); return; }
    const weekday = new Date(`${workDate}T12:00:00`).getDay();
    const [{ data: persons }, { data: schedules }, { data: attendance }] = await Promise.all([
      db.from("people").select("id,full_name,qualification,contract_type").eq("project_id", project.id).eq("active", true).order("full_name"),
      db.from("project_work_schedules").select("*").eq("project_id", project.id).eq("weekday", weekday).maybeSingle(),
      db.from("daily_attendance").select("id,person_id,status,arrival_time,departure_time,scheduled_hours,regular_hours,automatic_overtime_hours,manual_overtime_hours,created_by").eq("project_id", project.id).eq("work_date", workDate),
    ]);
    const byPerson: Record<string, Attendance> = {};
    for (const row of attendance || []) byPerson[row.person_id] = { ...row, scheduled_hours: Number(row.scheduled_hours), regular_hours: Number(row.regular_hours), automatic_overtime_hours: Number(row.automatic_overtime_hours), manual_overtime_hours: row.manual_overtime_hours === null ? null : Number(row.manual_overtime_hours) } as Attendance;
    setProjectId(project.id); setUserId(auth.user.id); setPeople((persons || []) as Person[]); setSchedule(schedules ? { ...schedules, theoretical_hours: Number(schedules.theoretical_hours) } as WorkSchedule : undefined); setRows(byPerson); setLoading(false);
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [workDate]);

  function rowFor(personId: string): Attendance {
    return rows[personId] || { person_id: personId, status: "non_renseigne", arrival_time: null, departure_time: null, scheduled_hours: 0, regular_hours: 0, automatic_overtime_hours: 0, manual_overtime_hours: null };
  }
  function change(personId: string, patch: Partial<Attendance>) {
    setRows((current) => { const base = current[personId] || rowFor(personId); const next = { ...base, ...patch }; const calc = calculateAttendance(schedule, next.status, shortTime(next.arrival_time), shortTime(next.departure_time)); return { ...current, [personId]: { ...next, scheduled_hours: calc.scheduled, regular_hours: calc.regular, automatic_overtime_hours: calc.overtime, ...(next.status !== "present" ? { arrival_time: null, departure_time: null, manual_overtime_hours: null } : {}) } }; });
  }
  function markPresent(personId: string) {
    const current = rowFor(personId);
    change(personId, { status: current.status === "present" ? "non_renseigne" : "present" });
  }
  async function saveAll() {
    const missing = people.filter((person) => rowFor(person.id).status === "non_renseigne");
    if (missing.length) { toast(`Renseignez encore ${missing.length} personne${missing.length > 1 ? "s" : ""} : présent ou motif d’absence.`); return; }
    setSaving(true);
    const db = createSupabaseBrowserClient();
    const values = people.map((person) => { const row = rowFor(person.id); return { project_id: projectId, person_id: person.id, work_date: workDate, status: row.status, arrival_time: row.arrival_time || null, departure_time: row.departure_time || null, scheduled_hours: row.scheduled_hours, regular_hours: row.regular_hours, automatic_overtime_hours: row.automatic_overtime_hours, manual_overtime_hours: row.manual_overtime_hours, created_by: row.created_by || userId, updated_by: userId, updated_at: new Date().toISOString() }; });
    const { error } = await db.from("daily_attendance").upsert(values, { onConflict: "project_id,person_id,work_date" });
    setSaving(false);
    if (error) toast(`Enregistrement impossible : ${error.message}`); else { toast(`${people.length} présences enregistrées`); await load(); }
  }
  const summary = people.reduce((acc, person) => { const row = rowFor(person.id); acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {} as Record<string, number>);
  if (loading) return <div className="content page-content"><div className="panel empty-state">Chargement des présences…</div></div>;
  return <div className="content page-content presence-page">
    <div className="page-head"><div><h2>Présence du matin · {dateLabel}</h2><p>Validez les présents d’un clic, puis choisissez uniquement le motif des non-présents.</p></div><div className="presence-actions"><span className="status">{schedule?.is_working_day ? `${schedule.theoretical_hours} h théoriques · ${shortTime(schedule.start_time)}–${shortTime(schedule.end_time)}` : "Journée non travaillée"}</span><button className="primary" disabled={saving || !people.length} onClick={() => void saveAll()}>{saving ? "Enregistrement…" : "Enregistrer toutes les présences"}</button></div></div>
    <section className="presence-kpis"><div><b>{summary.present || 0}</b><small>Présents</small></div><div><b>{summary.non_renseigne || 0}</b><small>Non renseignés</small></div><div><b>{people.length - (summary.present || 0) - (summary.non_renseigne || 0)}</b><small>Absences justifiées</small></div></section>
    <div className="panel presence-table"><div className="presence-head"><span>COLLABORATEUR</span><span>PRÉSENT</span><span>MOTIF SI NON-PRÉSENT</span><span>ARRIVÉE</span><span>DÉPART</span><span>HEURES NORMALES</span><span>HEURES SUP.</span></div>
      {people.map((person) => { const row = rowFor(person.id); const overtime = row.manual_overtime_hours ?? row.automatic_overtime_hours; return <div className={`presence-row ${row.status === "present" ? "is-present" : ""}`} key={person.id}><div><b>{person.full_name}</b><small>{person.qualification || "Sans qualification"}</small></div><button className={`present-toggle ${row.status === "present" ? "active" : ""}`} aria-pressed={row.status === "present"} onClick={() => markPresent(person.id)}>{row.status === "present" ? "✓ Présent" : "Valider"}</button><select disabled={row.status === "present"} value={row.status === "present" ? "non_renseigne" : row.status} onChange={(e) => change(person.id, { status: e.target.value as AttendanceStatus })}>{absenceReasons.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><input type="time" disabled={row.status !== "present"} value={shortTime(row.arrival_time)} onChange={(e) => change(person.id, { arrival_time: e.target.value })}/><input type="time" disabled={row.status !== "present"} value={shortTime(row.departure_time)} onChange={(e) => change(person.id, { departure_time: e.target.value })}/><strong>{row.regular_hours.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h</strong><label className="overtime-field"><input type="number" min="0" max="24" step="0.25" disabled={row.status !== "present"} value={overtime} onChange={(e) => change(person.id, { manual_overtime_hours: Number(e.target.value) })}/>{row.manual_overtime_hours !== null && <small>corrigé · auto {row.automatic_overtime_hours.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h</small>}</label></div>; })}
    </div>
    <div className="presence-save-bar"><span>{summary.non_renseigne || 0} personne(s) restent à renseigner</span><button className="primary" disabled={saving || !people.length} onClick={() => void saveAll()}>{saving ? "Enregistrement…" : "Enregistrer la feuille de présence"}</button></div>
  </div>;
}

export function WorkScheduleSettings({ toast }: { toast: (message: string) => void }) {
  const [rows, setRows] = useState<WorkSchedule[]>([]); const [projectId, setProjectId] = useState(""); const [userId, setUserId] = useState(""); const [saving, setSaving] = useState(false);
  async function load() { const db = createSupabaseBrowserClient(); const [{ data: auth }, { data: project }] = await Promise.all([db.auth.getUser(), db.from("projects").select("id").eq("code", "24-018").single()]); if (!project || !auth.user) return; const { data } = await db.from("project_work_schedules").select("*").eq("project_id", project.id).order("weekday"); setProjectId(project.id); setUserId(auth.user.id); setRows((data || []).map((row) => ({ ...row, theoretical_hours: Number(row.theoretical_hours) })) as WorkSchedule[]); }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  function update(weekday: number, patch: Partial<WorkSchedule>) { setRows((current) => current.map((row) => row.weekday === weekday ? { ...row, ...patch } : row)); }
  async function save() { setSaving(true); const db = createSupabaseBrowserClient(); const payload = rows.map((row) => ({ project_id: projectId, weekday: row.weekday, is_working_day: row.is_working_day, start_time: row.start_time, end_time: row.end_time, break_minutes: Number(row.break_minutes), theoretical_hours: row.is_working_day ? Math.max(0, (minutes(shortTime(row.end_time)) - minutes(shortTime(row.start_time)) - Number(row.break_minutes)) / 60) : 0, updated_by: userId, updated_at: new Date().toISOString() })); const { error } = await db.from("project_work_schedules").upsert(payload, { onConflict: "project_id,weekday" }); setSaving(false); if (error) toast(`Enregistrement impossible : ${error.message}`); else { toast("Horaires enregistrés"); await load(); } }
  return <div className="panel settings-form"><div className="panel-title"><div><span>HORAIRES DU CHANTIER</span><h3>Planning théorique du lundi au dimanche</h3></div></div><div className="schedule-table"><div className="schedule-head"><span>JOUR</span><span>TRAVAILLÉ</span><span>DÉBUT</span><span>FIN</span><span>PAUSE</span><span>VOLUME CALCULÉ</span></div>{rows.map((row) => { const theoretical = row.is_working_day ? Math.max(0, (minutes(shortTime(row.end_time)) - minutes(shortTime(row.start_time)) - Number(row.break_minutes)) / 60) : 0; return <div className="schedule-row" key={row.weekday}><b>{dayNames[row.weekday]}</b><input type="checkbox" checked={row.is_working_day} onChange={(e) => update(row.weekday, { is_working_day: e.target.checked })}/><input type="time" disabled={!row.is_working_day} value={shortTime(row.start_time)} onChange={(e) => update(row.weekday, { start_time: e.target.value })}/><input type="time" disabled={!row.is_working_day} value={shortTime(row.end_time)} onChange={(e) => update(row.weekday, { end_time: e.target.value })}/><label><input type="number" min="0" max="480" step="15" disabled={!row.is_working_day} value={row.break_minutes} onChange={(e) => update(row.weekday, { break_minutes: Number(e.target.value) })}/><small>min</small></label><strong>{theoretical.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h</strong></div>; })}</div><div className="settings-actions"><button className="primary" disabled={saving || !rows.length} onClick={() => void save()}>{saving ? "Enregistrement…" : "Enregistrer les horaires"}</button></div></div>;
}
