"use client";

import { useEffect, useMemo, useState } from "react";
import type { View, PersonRow } from "@/app/shared";
import { Kpi } from "@/app/ui/kpi";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { isoWeekNumber } from "@/lib/timesheet";

export function Dashboard({
  setView,
  toast,
  workDate,
}: {
  setView: (v: View) => void;
  toast: (s: string) => void;
  workDate: string;
}) {
  type Period = "day" | "week" | "month" | "all";
  type DashboardTask = { id: string; code: string; name: string; budget_hours: number | string };
  type DashboardZone = { id: string; code: string; name: string; physical_progress: number | string };
  type DashboardEntry = {
    person_id: string; task_id: string; zone_id: string | null; work_date: string;
    hours: number | string; created_at: string;
  };
  type DashboardAttendance = { person_id: string; work_date: string; status: string; regular_hours: number | string; automatic_overtime_hours: number | string; manual_overtime_hours: number | string | null };
  type DashboardSchedule = { weekday: number; is_working_day: boolean; theoretical_hours: number | string };
  type DashboardEquipment = { id:string; category:"engin"|"outillage"|"acces"; internal_reference:string; description:string; vic_due_date:string|null; rental_planned_end_date:string|null; rental_actual_end_date:string|null; status:string; active:boolean };

  const [period, setPeriod] = useState<Period>("week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState(workDate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [peopleRows, setPeopleRows] = useState<PersonRow[]>([]);
  const [taskRows, setTaskRows] = useState<DashboardTask[]>([]);
  const [zoneRows, setZoneRows] = useState<DashboardZone[]>([]);
  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<DashboardAttendance[]>([]);
  const [scheduleRows, setScheduleRows] = useState<DashboardSchedule[]>([]);
  const [equipmentRows, setEquipmentRows] = useState<DashboardEquipment[]>([]);
  const [vicWarningDays, setVicWarningDays] = useState(30);

  const dateRange = useMemo(() => {
    const anchor = new Date(`${workDate}T12:00:00`);
    const start = new Date(anchor);
    const end = new Date(anchor);
    if (period === "week") {
      const offset = (anchor.getDay() + 6) % 7;
      start.setDate(anchor.getDate() - offset);
      end.setDate(start.getDate() + 6);
    } else if (period === "month") {
      start.setDate(1);
      end.setMonth(start.getMonth() + 1, 0);
    } else if (period === "all") {
      if (customStart) start.setTime(new Date(`${customStart}T12:00:00`).getTime());
      else start.setFullYear(2000, 0, 1);
      end.setTime(new Date(`${customEnd || workDate}T12:00:00`).getTime());
    }
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    return { start: iso(start), end: iso(end) };
  }, [period, workDate, customStart, customEnd]);

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      setLoading(true);
      setError("");
      const db = createSupabaseBrowserClient();
      const { data: project, error: projectError } = await db
        .from("projects").select("id,vic_warning_days").eq("code", "24-018").single();
      if (!project || projectError) {
        if (active) { setError("Le chantier n’a pas pu être chargé."); setLoading(false); }
        return;
      }
      const [personsResult, tasksResult, zonesResult, entriesResult, attendanceResult, schedulesResult, equipmentResult] = await Promise.all([
        db.from("people")
          .select("id,full_name,qualification,contract_type,coefficient,active,agency_id,agencies(name)")
          .eq("project_id", project.id).eq("active", true).order("full_name"),
        db.from("tasks").select("id,code,name,budget_hours")
          .eq("project_id", project.id).order("code"),
        db.from("zones").select("id,code,name,physical_progress")
          .eq("project_id", project.id).order("code"),
        db.from("time_entries")
          .select("person_id,task_id,zone_id,work_date,hours,created_at")
          .eq("project_id", project.id).order("created_at", { ascending: false }),
        db.from("daily_attendance").select("person_id,work_date,status,regular_hours,automatic_overtime_hours,manual_overtime_hours").eq("project_id", project.id).gte("work_date", dateRange.start < workDate ? dateRange.start : workDate).lte("work_date", dateRange.end > workDate ? dateRange.end : workDate),
        db.from("project_work_schedules").select("weekday,is_working_day,theoretical_hours").eq("project_id", project.id),
        db.from("equipment_assets").select("id,category,internal_reference,description,vic_due_date,rental_planned_end_date,rental_actual_end_date,status,active").eq("project_id",project.id).eq("active",true),
      ]);
      const firstError = personsResult.error || tasksResult.error || zonesResult.error || entriesResult.error;
      if (!active) return;
      if (firstError) setError("Certaines données du tableau de bord sont indisponibles.");
      setPeopleRows((personsResult.data || []) as unknown as PersonRow[]);
      setTaskRows((tasksResult.data || []) as DashboardTask[]);
      setZoneRows((zonesResult.data || []) as DashboardZone[]);
      setEntries((entriesResult.data || []) as DashboardEntry[]);
      setAttendanceRows((attendanceResult.data || []) as DashboardAttendance[]);
      setScheduleRows((schedulesResult.data || []) as DashboardSchedule[]);
      setEquipmentRows((equipmentResult.data || []) as DashboardEquipment[]);
      setVicWarningDays(Number(project.vic_warning_days || 30));
      setLoading(false);
    }
    loadDashboard();
    return () => { active = false; };
  }, [dateRange.start, dateRange.end, workDate]);

  const hours = (rows: DashboardEntry[]) => rows.reduce((sum, row) => sum + Number(row.hours || 0), 0);
  const periodEntries = entries.filter((entry) => entry.work_date >= dateRange.start && entry.work_date <= dateRange.end);
  const totalHours = hours(periodEntries);
  const todayEntries = entries.filter((entry) => entry.work_date === workDate);
  const todayHours = hours(todayEntries);
  const todayAttendance = attendanceRows.filter((row) => row.work_date === workDate);
  const presentIds = new Set(todayAttendance.filter((row) => row.status === "present").map((row) => row.person_id));
  const recordedIds = new Set(todayAttendance.filter((row) => row.status !== "non_renseigne").map((row) => row.person_id));
  const missingPeople = peopleRows.filter((person) => !recordedIds.has(person.id));
  const internalCount = peopleRows.filter((person) => person.contract_type === "interne").length;
  const interimCount = peopleRows.length - internalCount;
  const periodDays = period === "day" ? 1 : Math.max(1, Math.round((new Date(`${dateRange.end}T12:00:00`).getTime() - new Date(`${dateRange.start}T12:00:00`).getTime()) / 86400000) + 1);
  const expectedHours = Array.from({ length: periodDays }, (_, i) => {
    const date = new Date(`${dateRange.start}T12:00:00`); date.setDate(date.getDate() + i);
    const schedule = scheduleRows.find((row) => row.weekday === date.getDay());
    return schedule?.is_working_day ? Number(schedule.theoretical_hours) * peopleRows.length : 0;
  }).reduce((sum, value) => sum + value, 0);
  const completion = expectedHours ? Math.round((totalHours / expectedHours) * 100) : 0;

  const taskStats = taskRows.map((task, index) => {
    const done = hours(entries.filter((entry) => entry.task_id === task.id));
    const budget = Number(task.budget_hours || 0);
    return { ...task, done, budget, percent: budget ? Math.round((done / budget) * 100) : 0, color: ["#397f68", "#506fa7", "#936f25", "#795b9d", "#b15e43"][index % 5] };
  }).sort((a, b) => b.percent - a.percent);
  const totalBudget = taskRows.reduce((sum, task) => sum + Number(task.budget_hours || 0), 0);
  const budgetUsed = totalBudget ? Math.round((totalHours / totalBudget) * 100) : 0;
  const zoneStats = zoneRows.map((zone) => ({
    ...zone,
    hours: hours(periodEntries.filter((entry) => entry.zone_id === zone.id)),
    physical: Number(zone.physical_progress || 0),
  })).sort((a, b) => b.hours - a.hours);

  const alerts = [
    ...(missingPeople.length ? [{ tone: "gold", title: `${missingPeople.length} présence${missingPeople.length > 1 ? "s" : ""} à renseigner le ${new Date(`${workDate}T12:00:00`).toLocaleDateString("fr-FR")}`, detail: missingPeople.slice(0, 3).map((p) => p.full_name).join(", "), view: "presence" as View }] : []),
    ...taskStats.filter((task) => task.percent >= 100).map((task) => ({ tone: "red", title: `Budget dépassé · ${task.code}`, detail: `${task.done.toLocaleString("fr-FR")} h sur ${task.budget.toLocaleString("fr-FR")} h`, view: "taches" as View })),
    ...taskStats.filter((task) => task.percent >= 80 && task.percent < 100).map((task) => ({ tone: "gold", title: `Budget à surveiller · ${task.code}`, detail: `${task.percent}% consommé`, view: "taches" as View })),
    ...zoneStats.filter((zone) => zone.physical === 0 && zone.hours > 0).map((zone) => ({ tone: "blue", title: `Avancement à renseigner · ${zone.code}`, detail: `${zone.hours.toLocaleString("fr-FR")} h déjà affectées`, view: "zones" as View })),
    ...equipmentRows.flatMap((asset) => {
      const rows: Array<{tone:string;title:string;detail:string;view:View}> = [];
      const remaining = (date:string|null) => date === null ? null : Math.ceil((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86400000);
      const vicDays = remaining(asset.vic_due_date);
      const equipmentView:View = asset.category === "engin" ? "engins" : asset.category === "outillage" ? "outillage" : "acces";
      if (vicDays !== null && vicDays < 0) rows.push({ tone:"red", title:`VIC dépassée · ${asset.internal_reference}`, detail:asset.description, view:equipmentView });
      else if (vicDays !== null && vicDays <= vicWarningDays) rows.push({ tone:"gold", title:`VIC à programmer · ${asset.internal_reference}`, detail:`${vicDays} jour(s) avant échéance`, view:equipmentView });
      const rentalDays = asset.rental_actual_end_date ? null : remaining(asset.rental_planned_end_date);
      if (rentalDays !== null && rentalDays <= vicWarningDays) rows.push({ tone:rentalDays < 0 ? "red" : "blue", title:`Location ${rentalDays < 0 ? "échue" : "à terminer"} · ${asset.internal_reference}`, detail:asset.description, view:equipmentView });
      if (["maintenance","hors_service"].includes(asset.status)) rows.push({ tone:asset.status === "hors_service" ? "red" : "gold", title:`${asset.status === "hors_service" ? "Hors service" : "Maintenance"} · ${asset.internal_reference}`, detail:asset.description, view:equipmentView });
      return rows;
    }),
  ].slice(0, 5);

  const periodLabels: Record<Period, string> = { day: "Jour", week: "Semaine", month: "Mois", all: "Cumul" };
  return (
    <div className="content">
      <section className="intro">
        <div>
          <h2>Voici où en est votre chantier aujourd’hui.</h2>
          <p>Données actualisées depuis les pointages du chantier</p>
        </div>
        <div className="dashboard-period" aria-label="Période du tableau de bord">
          {(Object.keys(periodLabels) as Period[]).map((key) => (
            <button className={period === key ? "active" : ""} key={key} onClick={() => {
              if (key === "all" && !customStart && entries.length) {
                setCustomStart(entries.reduce((earliest, entry) => entry.work_date < earliest ? entry.work_date : earliest, entries[0].work_date));
              }
              if (key === "all" && !customEnd) setCustomEnd(workDate);
              setPeriod(key);
            }}>{periodLabels[key]}</button>
          ))}
          {period === "all" ? <div className="dashboard-custom-range">
            <label>Du<input type="date" value={customStart} max={customEnd || workDate} onChange={(event) => setCustomStart(event.target.value)} /></label>
            <label>Au<input type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} /></label>
          </div> : null}
        </div>
      </section>
      {error && <div className="dashboard-error">{error}</div>}
      <section className="kpis">
        <Kpi
          label="POINTAGE DE LA PÉRIODE"
          value={loading ? "…" : `${totalHours.toLocaleString("fr-FR")} h`}
          detail={expectedHours ? `sur ${expectedHours.toLocaleString("fr-FR")} h théoriques` : "Aucune heure théorique sur la période"}
          tone="green"
          ring={Math.min(completion, 100)}
        />
        <Kpi
          label="BUDGET CONSOMMÉ"
          value={loading ? "…" : `${budgetUsed}%`}
          detail={`${totalBudget.toLocaleString("fr-FR")} h budgétées`}
          tone="blue"
          progress={Math.min(budgetUsed, 100)}
        />
        <Kpi
          label="ÉQUIPE AUJOURD’HUI"
          value={loading ? "…" : `${presentIds.size}/${peopleRows.length} pers.`}
          detail={`${internalCount} internes · ${interimCount} intérimaires`}
          tone="gold"
          avatars
        />
        <Kpi
          label="À AFFECTER AUJOURD’HUI"
          value={loading ? "…" : `${Math.max(0, todayAttendance.reduce((sum, row) => row.status === "present" ? sum + Number(row.regular_hours) + Number(row.manual_overtime_hours ?? row.automatic_overtime_hours) : sum, 0) - todayHours).toLocaleString("fr-FR")} h`}
          detail={`${todayHours.toLocaleString("fr-FR")} h déjà pointées`}
          tone={todayHours > todayAttendance.reduce((sum, row) => row.status === "present" ? sum + Number(row.regular_hours) + Number(row.manual_overtime_hours ?? row.automatic_overtime_hours) : sum, 0) ? "red" : "gold"}
        />
      </section>
      <section className="two-cols">
        <div className="panel task-panel">
          <div className="panel-title">
            <div>
              <span>CONSOMMATION PAR TÂCHE</span>
              <h3>Budget d’heures vs réalisé</h3>
            </div>
            <button onClick={() => setView("taches")}>Voir le détail →</button>
          </div>
          <div className="task-head">
            <span>TÂCHE</span>
            <span>BUDGET</span>
            <span>RÉALISÉ</span>
            <span>AVANCEMENT</span>
          </div>
          {taskStats.slice(0, 5).map((t) => {
            const p = t.percent;
            return (
              <div className="task-row" key={t.code}>
                <div>
                  <i style={{ background: t.color }} />
                  <span>
                    <b>{t.name}</b>
                    <small>{t.code}</small>
                  </span>
                </div>
                <strong>{t.budget} h</strong>
                <strong>{t.done} h</strong>
                <div>
                  <span>{p}%</span>
                  <div className="bar">
                    <i style={{ width: `${p}%`, background: t.color }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="panel dashboard-alerts dashboard-alerts-inline">
          <div className="panel-title">
            <div>
              <span>POINTS D’ATTENTION</span>
              <h3>Alertes actionnables</h3>
            </div>
            <b>{alerts.length}</b>
          </div>
          {alerts.length ? alerts.map((alert, index) => (
            <button key={`${alert.title}-${index}`} onClick={() => setView(alert.view)}>
              <i className={alert.tone}>!</i><span><b>{alert.title}</b><small>{alert.detail}</small></span><em>›</em>
            </button>
          )) : <p className="dashboard-empty">Aucune alerte sur la période sélectionnée.</p>}
        </div>
      </section>
      <section className="bottom-grid">
        <div className="panel dashboard-zones">
          <div className="panel-title">
            <div>
              <span>AVANCEMENT PAR ZONE</span>
              <h3>Heures et avancement physique</h3>
            </div>
            <button onClick={() => setView("zones")}>Voir les zones →</button>
          </div>
          <div className="dashboard-zone-list">
            {zoneStats.map((zone) => (
              <div className="dashboard-zone-row" key={zone.id}>
                <div><b>{zone.name}</b><small>{zone.code} · {zone.hours.toLocaleString("fr-FR")} h</small></div>
                <div className="dashboard-zone-progress"><span>{zone.physical}%</span><div className="bar"><i style={{ width: `${zone.physical}%` }} /></div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="quick">
          <span>ACTIONS RAPIDES</span>
          <button onClick={() => setView("pointage")}>
            <i>◷</i>
            <div>
              <b>Saisir les heures</b>
              <small>{new Date(`${workDate}T12:00:00`).toLocaleDateString("fr-FR")}</small>
            </div>
            <em>›</em>
          </button>
          <button onClick={() => setView("cables")}>
            <i>⇧</i>
            <div>
              <b>Importer un carnet</b>
              <small>Fichier Excel client</small>
            </div>
            <em>›</em>
          </button>
          <button onClick={() => toast("La génération de rapport sera ajoutée au prochain lot")}>
            <i>▤</i>
            <div>
              <b>Générer le rapport</b>
              <small>Semaine {isoWeekNumber(new Date(`${workDate}T12:00:00`))}</small>
            </div>
            <em>›</em>
          </button>
        </div>
      </section>
    </div>
  );
}
