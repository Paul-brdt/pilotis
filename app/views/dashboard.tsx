"use client";

import { useEffect, useMemo, useState } from "react";
import type { View, PersonRow } from "@/app/shared";
import { fetchAllRows } from "@/lib/fetch-all";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Period = "day" | "week" | "month" | "all";
type DashboardTask = {
  id: string;
  code: string;
  name: string;
  budget_hours: number | string;
};
type DashboardZone = {
  id: string;
  code: string;
  name: string;
  physical_progress: number | string;
};
type DashboardEntry = {
  person_id: string;
  task_id: string;
  zone_id: string | null;
  work_date: string;
  hours: number | string;
  created_at: string;
};
type DashboardAttendance = {
  person_id: string;
  work_date: string;
  status: string;
  regular_hours: number | string;
  automatic_overtime_hours: number | string;
  manual_overtime_hours: number | string | null;
};
type DashboardSchedule = {
  weekday: number;
  is_working_day: boolean;
  theoretical_hours: number | string;
};
type DashboardEquipment = {
  id: string;
  category: "engin" | "outillage" | "acces";
  internal_reference: string;
  description: string;
  vic_due_date: string | null;
  rental_planned_end_date: string | null;
  rental_actual_end_date: string | null;
  status: string;
  active: boolean;
};
type DashboardAllocation = {
  zone_id: string;
  allocated_hours: number | string;
};
type Alert = {
  tone: "warn" | "danger" | "info";
  title: string;
  detail: string;
  view: View;
};

const periodLabels: Record<Period, string> = {
  day: "Jour",
  week: "Semaine",
  month: "Mois",
  all: "Depuis le début",
};
const MAX_ALERTS = 6;

const hoursLabel = (value: number) =>
  `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h`;
const percentLabel = (value: number) =>
  `${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %`;
const sumHours = (rows: { hours: number | string }[]) =>
  rows.reduce((sum, row) => sum + Number(row.hours || 0), 0);

export function Dashboard({
  setView,
  workDate,
}: {
  setView: (v: View) => void;
  workDate: string;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [peopleRows, setPeopleRows] = useState<PersonRow[]>([]);
  const [taskRows, setTaskRows] = useState<DashboardTask[]>([]);
  const [zoneRows, setZoneRows] = useState<DashboardZone[]>([]);
  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<DashboardAttendance[]>(
    [],
  );
  const [scheduleRows, setScheduleRows] = useState<DashboardSchedule[]>([]);
  const [equipmentRows, setEquipmentRows] = useState<DashboardEquipment[]>([]);
  const [allocationRows, setAllocationRows] = useState<DashboardAllocation[]>(
    [],
  );
  const [vicWarningDays, setVicWarningDays] = useState(30);
  // Deadlines (VIC, rentals) count from the real today, read once.
  const [now] = useState(() => Date.now());

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
      start.setFullYear(2000, 0, 1);
    }
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    return { start: iso(start), end: iso(end) };
  }, [period, workDate]);

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      setLoading(true);
      setError("");
      const db = createSupabaseBrowserClient();
      const { data: project, error: projectError } = await db
        .from("projects")
        .select("id,vic_warning_days")
        .eq("code", "24-018")
        .single();
      if (!project || projectError) {
        if (active) {
          setError("Le chantier n’a pas pu être chargé.");
          setLoading(false);
        }
        return;
      }
      const [
        personsResult,
        tasksResult,
        zonesResult,
        entriesResult,
        attendanceResult,
        schedulesResult,
        equipmentResult,
        allocationsResult,
      ] = await Promise.all([
        db
          .from("people")
          .select(
            "id,full_name,qualification,contract_type,coefficient,active,agency_id,agencies(name)",
          )
          .eq("project_id", project.id)
          .eq("active", true)
          .order("full_name"),
        db
          .from("tasks")
          .select("id,code,name,budget_hours")
          .eq("project_id", project.id)
          .order("code"),
        db
          .from("zones")
          .select("id,code,name,physical_progress")
          .eq("project_id", project.id)
          .order("code"),
        fetchAllRows<DashboardEntry>((from, to) =>
          db
            .from("time_entries")
            .select("person_id,task_id,zone_id,work_date,hours,created_at")
            .eq("project_id", project.id)
            .order("created_at", { ascending: false })
            .order("id")
            .range(from, to),
        ),
        db
          .from("daily_attendance")
          .select(
            "person_id,work_date,status,regular_hours,automatic_overtime_hours,manual_overtime_hours",
          )
          .eq("project_id", project.id)
          .gte(
            "work_date",
            dateRange.start < workDate ? dateRange.start : workDate,
          )
          .lte(
            "work_date",
            dateRange.end > workDate ? dateRange.end : workDate,
          ),
        db
          .from("project_work_schedules")
          .select("weekday,is_working_day,theoretical_hours")
          .eq("project_id", project.id),
        db
          .from("equipment_assets")
          .select(
            "id,category,internal_reference,description,vic_due_date,rental_planned_end_date,rental_actual_end_date,status,active",
          )
          .eq("project_id", project.id)
          .eq("active", true),
        db
          .from("zone_task_budget_allocations")
          .select("zone_id,allocated_hours")
          .eq("project_id", project.id),
      ]);
      const firstError =
        personsResult.error ||
        tasksResult.error ||
        zonesResult.error ||
        entriesResult.error;
      if (!active) return;
      if (firstError)
        setError("Certaines données de la vue d’ensemble sont indisponibles.");
      setPeopleRows((personsResult.data || []) as unknown as PersonRow[]);
      setTaskRows((tasksResult.data || []) as DashboardTask[]);
      setZoneRows((zonesResult.data || []) as DashboardZone[]);
      setEntries(entriesResult.data);
      setAttendanceRows((attendanceResult.data || []) as DashboardAttendance[]);
      setScheduleRows((schedulesResult.data || []) as DashboardSchedule[]);
      setEquipmentRows((equipmentResult.data || []) as DashboardEquipment[]);
      setAllocationRows(
        (allocationsResult.data || []) as DashboardAllocation[],
      );
      setVicWarningDays(Number(project.vic_warning_days || 30));
      setLoading(false);
    }
    loadDashboard();
    return () => {
      active = false;
    };
  }, [dateRange.start, dateRange.end, workDate]);

  // Period hours against what the work schedule expected.
  const periodEntries = entries.filter(
    (entry) =>
      entry.work_date >= dateRange.start && entry.work_date <= dateRange.end,
  );
  const periodHours = sumHours(periodEntries);
  const periodStart =
    period === "all" && entries.length
      ? entries.reduce(
          (earliest, entry) =>
            entry.work_date < earliest ? entry.work_date : earliest,
          entries[0].work_date,
        )
      : dateRange.start;
  const periodEnd = period === "all" ? workDate : dateRange.end;
  const periodDays = Math.max(
    1,
    Math.round(
      (new Date(`${periodEnd}T12:00:00`).getTime() -
        new Date(`${periodStart}T12:00:00`).getTime()) /
        86400000,
    ) + 1,
  );
  const expectedHours = Array.from({ length: periodDays }, (_, i) => {
    const date = new Date(`${periodStart}T12:00:00`);
    date.setDate(date.getDate() + i);
    const schedule = scheduleRows.find((row) => row.weekday === date.getDay());
    return schedule?.is_working_day
      ? Number(schedule.theoretical_hours) * peopleRows.length
      : 0;
  }).reduce((sum, value) => sum + value, 0);

  // Budget: cumulative, whatever the period.
  const cumulativeHours = sumHours(entries);
  const totalBudget = taskRows.reduce(
    (sum, task) => sum + Number(task.budget_hours || 0),
    0,
  );
  const budgetUsed = totalBudget ? (cumulativeHours / totalBudget) * 100 : 0;
  const taskStats = taskRows.map((task) => {
    const done = sumHours(entries.filter((entry) => entry.task_id === task.id));
    const budget = Number(task.budget_hours || 0);
    return {
      ...task,
      done,
      budget,
      remaining: budget - done,
      percent: budget ? (done / budget) * 100 : 0,
    };
  });

  // Today.
  const todayAttendance = attendanceRows.filter(
    (row) => row.work_date === workDate,
  );
  const presentRows = todayAttendance.filter((row) => row.status === "present");
  const recordedCount = todayAttendance.filter(
    (row) => row.status !== "non_renseigne",
  ).length;
  const missingPeople = peopleRows.filter(
    (person) =>
      !todayAttendance.some(
        (row) => row.person_id === person.id && row.status !== "non_renseigne",
      ),
  );
  const absentCount = recordedCount - presentRows.length;
  const internalCount = peopleRows.filter(
    (person) => person.contract_type === "interne",
  ).length;
  const todayTarget = presentRows.reduce(
    (sum, row) =>
      sum +
      Number(row.regular_hours) +
      Number(row.manual_overtime_hours ?? row.automatic_overtime_hours),
    0,
  );
  const todayAssigned = sumHours(
    entries.filter((entry) => entry.work_date === workDate),
  );
  const todayToAssign = Math.max(0, todayTarget - todayAssigned);
  const todayOver = Math.max(0, todayAssigned - todayTarget);

  // Physical progress, weighted by each zone's allocated budget.
  const zoneStats = zoneRows.map((zone) => {
    const budget = allocationRows
      .filter((row) => row.zone_id === zone.id)
      .reduce((sum, row) => sum + Number(row.allocated_hours || 0), 0);
    return {
      ...zone,
      budget,
      physical: Number(zone.physical_progress || 0),
      hours: sumHours(entries.filter((entry) => entry.zone_id === zone.id)),
      periodHours: sumHours(
        periodEntries.filter((entry) => entry.zone_id === zone.id),
      ),
    };
  });
  const zonesBudget = zoneStats.reduce((sum, zone) => sum + zone.budget, 0);
  const anyProgress = zoneStats.some((zone) => zone.physical > 0);
  const weightedProgress = !anyProgress
    ? null
    : zonesBudget
      ? zoneStats.reduce((sum, zone) => sum + zone.budget * zone.physical, 0) /
        zonesBudget
      : zoneStats.reduce((sum, zone) => sum + zone.physical, 0) /
        zoneStats.length;
  // Productivity: hours earned (budget × progress) over hours spent there.
  const earnedHours = zoneStats.reduce(
    (sum, zone) => sum + (zone.budget * zone.physical) / 100,
    0,
  );
  const spentOnBudgetedZones = zoneStats
    .filter((zone) => zone.budget > 0)
    .reduce((sum, zone) => sum + zone.hours, 0);
  const productivity =
    earnedHours > 0 && spentOnBudgetedZones > 0
      ? earnedHours / spentOnBudgetedZones
      : null;
  const zonesToUpdate = zoneStats.filter(
    (zone) => zone.hours > 0 && zone.physical === 0,
  );
  const activeZones = zoneStats
    .filter((zone) => zone.periodHours > 0)
    .sort((a, b) => b.periodHours - a.periodHours);

  // The day in three steps.
  const steps = [
    missingPeople.length === 0 && peopleRows.length > 0
      ? {
          done: true,
          title: "Présence du matin",
          detail: `${recordedCount} sur ${peopleRows.length} renseignées · ${presentRows.length} présent${presentRows.length > 1 ? "s" : ""}, ${absentCount} absent${absentCount > 1 ? "s" : ""}`,
          view: "presence" as View,
          action: "",
        }
      : {
          done: false,
          title: "Présence du matin",
          detail: `${missingPeople.length} personne${missingPeople.length > 1 ? "s" : ""} à renseigner`,
          view: "presence" as View,
          action: "Saisir la présence",
        },
    !presentRows.length
      ? {
          done: false,
          title: "Affectation des heures",
          detail: "Après la présence du matin",
          view: "pointage" as View,
          action: "",
        }
      : todayOver > 0
        ? {
            done: false,
            title: "Affectation des heures",
            detail: `${hoursLabel(todayOver)} affectées au-delà de la présence`,
            view: "pointage" as View,
            action: "Vérifier",
          }
        : todayToAssign > 0
          ? {
              done: false,
              title: "Affectation des heures",
              detail: `${hoursLabel(todayToAssign)} à affecter sur ${hoursLabel(todayTarget)}`,
              view: "pointage" as View,
              action: "Affecter les heures",
            }
          : {
              done: true,
              title: "Affectation des heures",
              detail: `${hoursLabel(todayAssigned)} sur ${hoursLabel(todayTarget)} affectées`,
              view: "pointage" as View,
              action: "",
            },
    zonesToUpdate.length
      ? {
          done: false,
          title: "Avancement à renseigner",
          detail: `${zonesToUpdate[0].code} ${zonesToUpdate[0].name} : ${hoursLabel(zonesToUpdate[0].hours)} affectées, avancement inconnu${zonesToUpdate.length > 1 ? ` (+${zonesToUpdate.length - 1} zone${zonesToUpdate.length > 2 ? "s" : ""})` : ""}`,
          view: "zones" as View,
          action: "Renseigner l’avancement",
        }
      : {
          done: true,
          title: "Avancement",
          detail: "À jour sur toutes les zones travaillées",
          view: "zones" as View,
          action: "",
        },
  ];
  const doneSteps = steps.filter((step) => step.done).length;

  // Items to deal with, beyond the day's steps.
  const remainingDays = (date: string | null) =>
    date === null
      ? null
      : Math.ceil((new Date(`${date}T12:00:00`).getTime() - now) / 86400000);
  const alerts: Alert[] = [
    ...taskStats
      .filter((task) => task.percent > 100)
      .map((task) => ({
        tone: "danger" as const,
        title: `Budget dépassé · ${task.code}`,
        detail: `${hoursLabel(task.done)} sur ${hoursLabel(task.budget)}`,
        view: "taches" as View,
      })),
    ...taskStats
      .filter((task) => task.percent >= 80 && task.percent <= 100)
      .map((task) => ({
        tone: "warn" as const,
        title: `Budget à surveiller · ${task.code}`,
        detail: `${percentLabel(task.percent)} consommé`,
        view: "taches" as View,
      })),
    ...equipmentRows.flatMap((asset) => {
      const rows: Alert[] = [];
      const view: View =
        asset.category === "engin"
          ? "engins"
          : asset.category === "outillage"
            ? "outillage"
            : "acces";
      const vicDays = remainingDays(asset.vic_due_date);
      if (vicDays !== null && vicDays < 0)
        rows.push({
          tone: "danger",
          title: `VIC dépassée · ${asset.internal_reference}`,
          detail: asset.description,
          view,
        });
      else if (vicDays !== null && vicDays <= vicWarningDays)
        rows.push({
          tone: "warn",
          title: `VIC à programmer · ${asset.internal_reference}`,
          detail: `${vicDays} jour${vicDays > 1 ? "s" : ""} avant l’échéance`,
          view,
        });
      const rentalDays = asset.rental_actual_end_date
        ? null
        : remainingDays(asset.rental_planned_end_date);
      if (rentalDays !== null && rentalDays <= vicWarningDays)
        rows.push({
          tone: rentalDays < 0 ? "danger" : "info",
          title: `Location ${rentalDays < 0 ? "échue" : "à terminer"} · ${asset.internal_reference}`,
          detail: asset.description,
          view,
        });
      if (["maintenance", "hors_service"].includes(asset.status))
        rows.push({
          tone: asset.status === "hors_service" ? "danger" : "warn",
          title: `${asset.status === "hors_service" ? "Hors service" : "En maintenance"} · ${asset.internal_reference}`,
          detail: asset.description,
          view,
        });
      return rows;
    }),
  ];

  const workDateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${workDate}T12:00:00`));
  const value = (text: string) => (loading ? "…" : text);
  const barTone = (percent: number) =>
    percent > 100 ? "danger" : percent >= 80 ? "warn" : "ok";

  return (
    <div className="content overview">
      <div className="overview-head">
        <div>
          <p>
            {workDateLabel.charAt(0).toUpperCase() + workDateLabel.slice(1)}
          </p>
          <h2>Vue d’ensemble</h2>
        </div>
        <div className="segmented" role="group" aria-label="Période">
          {(Object.keys(periodLabels) as Period[]).map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={period === key}
              onClick={() => setPeriod(key)}
            >
              {periodLabels[key]}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="overview-error">{error}</div>}

      <section className="overview-card" aria-labelledby="overview-day">
        <div className="overview-card-head">
          <h3 id="overview-day">La journée en 3 étapes</h3>
          <span>{value(`${doneSteps} sur 3 faites`)}</span>
        </div>
        <div className="overview-steps">
          {steps.map((step, index) => (
            <div
              className={`overview-step${step.done ? " is-done" : step.action ? " is-todo" : ""}`}
              key={step.title}
            >
              <span className="overview-step-mark" aria-hidden="true">
                {step.done ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className="overview-step-text">
                <b>
                  {step.title}
                  {step.done ? <span className="sr-only"> : fait</span> : null}
                </b>
                <small>{value(step.detail)}</small>
                {step.action && !loading && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setView(step.view)}
                  >
                    {step.action} →
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="overview-kpis" aria-label="Indicateurs de l’affaire">
        <div className="overview-kpi">
          <span>Heures · {periodLabels[period].toLowerCase()}</span>
          <strong>{value(hoursLabel(periodHours))}</strong>
          <small>
            {expectedHours
              ? `sur ${hoursLabel(expectedHours)} prévues au planning`
              : "aucune heure prévue au planning"}
          </small>
        </div>
        <div className="overview-kpi">
          <span>Budget consommé</span>
          <strong>{value(percentLabel(budgetUsed))}</strong>
          <div className={`meter meter-${barTone(budgetUsed)}`}>
            <i
              style={{
                width: `${Math.min(budgetUsed, 100)}%`,
              }}
            />
          </div>
          <small>
            {hoursLabel(cumulativeHours)} sur {hoursLabel(totalBudget)}{" "}
            budgétées
          </small>
        </div>
        <div className="overview-kpi">
          <span>Avancement physique</span>
          <strong className={weightedProgress === null ? "is-empty" : ""}>
            {value(
              weightedProgress === null ? "—" : percentLabel(weightedProgress),
            )}
          </strong>
          <small>
            {weightedProgress === null
              ? "Aucune zone renseignée."
              : zonesBudget
                ? "Moyenne des zones pondérée par leur budget."
                : "Moyenne simple : aucun budget réparti par zone."}
          </small>
        </div>
        <div className="overview-kpi">
          <span>Productivité</span>
          <strong className={productivity === null ? "is-empty" : ""}>
            {value(
              productivity === null
                ? "—"
                : productivity.toLocaleString("fr-FR", {
                    maximumFractionDigits: 2,
                  }),
            )}
          </strong>
          <small>
            {productivity === null
              ? "Heures gagnées ÷ heures dépensées, calculée dès qu’un avancement est saisi."
              : `${hoursLabel(earnedHours)} gagnées pour ${hoursLabel(spentOnBudgetedZones)} dépensées`}
          </small>
        </div>
        <div className="overview-kpi">
          <span>Équipe aujourd’hui</span>
          <strong>
            {value(`${presentRows.length} / ${peopleRows.length}`)}
          </strong>
          <small>
            {internalCount} interne{internalCount > 1 ? "s" : ""} ·{" "}
            {peopleRows.length - internalCount} intérimaire
            {peopleRows.length - internalCount > 1 ? "s" : ""}
            {absentCount > 0
              ? ` · ${absentCount} absence${absentCount > 1 ? "s" : ""}`
              : ""}
          </small>
        </div>
      </section>

      <div className="overview-columns">
        <section
          className="overview-card overview-tasks"
          aria-labelledby="overview-tasks"
        >
          <div className="overview-card-head">
            <h3 id="overview-tasks">Tâches : budget, réalisé, reste</h3>
            <button
              type="button"
              className="link-button"
              onClick={() => setView("taches")}
            >
              Toutes les tâches →
            </button>
          </div>
          <div className="overview-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Tâche</th>
                  <th scope="col">Budget</th>
                  <th scope="col">Réalisé</th>
                  <th scope="col">Reste</th>
                  <th scope="col">Consommation</th>
                </tr>
              </thead>
              <tbody>
                {taskStats.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <b>{task.name}</b>
                      <small>{task.code}</small>
                    </td>
                    <td>{hoursLabel(task.budget)}</td>
                    <td>{hoursLabel(task.done)}</td>
                    <td className={task.remaining < 0 ? "is-over" : ""}>
                      {hoursLabel(task.remaining)}
                    </td>
                    <td>
                      <span className="overview-consumption">
                        <span
                          className={`meter meter-${barTone(task.percent)}`}
                        >
                          <i
                            style={{ width: `${Math.min(task.percent, 100)}%` }}
                          />
                        </span>
                        <span>{percentLabel(task.percent)}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total affaire</th>
                  <td>{hoursLabel(totalBudget)}</td>
                  <td>{hoursLabel(cumulativeHours)}</td>
                  <td>{hoursLabel(totalBudget - cumulativeHours)}</td>
                  <td>{percentLabel(budgetUsed)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <aside className="overview-side">
          <section className="overview-card" aria-labelledby="overview-alerts">
            <div className="overview-card-head">
              <h3 id="overview-alerts">À traiter</h3>
              <span
                className={`chip ${alerts.length ? "chip-warn" : "chip-ok"}`}
              >
                {alerts.length}
              </span>
            </div>
            {alerts.slice(0, MAX_ALERTS).map((alert, index) => (
              <button
                type="button"
                className={`overview-alert is-${alert.tone}`}
                key={`${alert.title}-${index}`}
                onClick={() => setView(alert.view)}
              >
                <b>{alert.title}</b>
                <small>{alert.detail}</small>
              </button>
            ))}
            {alerts.length > MAX_ALERTS && (
              <p className="overview-note">
                Et {alerts.length - MAX_ALERTS} autre
                {alerts.length - MAX_ALERTS > 1 ? "s" : ""}.
              </p>
            )}
            {!alerts.length && !loading && (
              <p className="overview-note">
                Rien à signaler : budgets, VIC, locations et matériel sont dans
                les clous.
              </p>
            )}
          </section>
          <section className="overview-card" aria-labelledby="overview-zones">
            <div className="overview-card-head">
              <h3 id="overview-zones">Zones actives</h3>
              <button
                type="button"
                className="link-button"
                onClick={() => setView("zones")}
              >
                Toutes →
              </button>
            </div>
            {activeZones.map((zone) => (
              <div className="overview-zone" key={zone.id}>
                <span>
                  <b>{zone.name}</b>
                  <small>
                    {zone.code} · avancement{" "}
                    {zone.physical ? percentLabel(zone.physical) : "inconnu"}
                  </small>
                </span>
                <strong>{hoursLabel(zone.periodHours)}</strong>
              </div>
            ))}
            <p className="overview-note">
              {activeZones.length
                ? `${zoneRows.length - activeZones.length} autre${zoneRows.length - activeZones.length > 1 ? "s" : ""} zone${zoneRows.length - activeZones.length > 1 ? "s" : ""} sans heures sur la période.`
                : "Aucune heure sur la période."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
