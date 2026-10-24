"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export type AttendanceStatus =
  "non_renseigne" | "present" | "absent" | "conge" | "formation" | "maladie";
type Person = {
  id: string;
  full_name: string;
  qualification: string | null;
  contract_type: string;
};
export type WorkSchedule = {
  id?: string;
  project_id: string;
  weekday: number;
  is_working_day: boolean;
  start_time: string;
  end_time: string;
  break_minutes: number;
  theoretical_hours: number;
  updated_by?: string;
};
type Attendance = {
  id?: string;
  person_id: string;
  status: AttendanceStatus;
  arrival_time: string | null;
  departure_time: string | null;
  scheduled_hours: number;
  regular_hours: number;
  automatic_overtime_hours: number;
  manual_overtime_hours: number | null;
  created_by?: string;
};

const absenceReasons: Array<[AttendanceStatus, string]> = [
  ["non_renseigne", "Choisir un motif…"],
  ["absent", "Autre motif"],
  ["conge", "Congé"],
  ["formation", "Formation"],
  ["maladie", "Maladie"],
];
const dayNames = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];
const shortTime = (value: string | null | undefined) =>
  value ? value.slice(0, 5) : "";
const minutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};

export function calculateAttendance(
  schedule: WorkSchedule | undefined,
  status: AttendanceStatus,
  arrival: string,
  departure: string,
) {
  if (!schedule?.is_working_day || status !== "present")
    return { scheduled: 0, regular: 0, overtime: 0 };
  const scheduled = Number(schedule.theoretical_hours);
  const effectiveArrival = arrival || shortTime(schedule.start_time);
  const effectiveDeparture = departure || shortTime(schedule.end_time);
  const late = Math.max(
    0,
    minutes(effectiveArrival) - minutes(shortTime(schedule.start_time)),
  );
  const early = Math.max(
    0,
    minutes(shortTime(schedule.end_time)) - minutes(effectiveDeparture),
  );
  const overtime =
    Math.max(
      0,
      minutes(effectiveDeparture) - minutes(shortTime(schedule.end_time)),
    ) / 60;
  return {
    scheduled,
    regular: Math.max(0, scheduled - (late + early) / 60),
    overtime,
  };
}

export function MorningPresence({
  workDate,
  dateLabel,
  toast,
}: {
  workDate: string;
  dateLabel: string;
  toast: (message: string) => void;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [schedule, setSchedule] = useState<WorkSchedule>();
  const [rows, setRows] = useState<Record<string, Attendance>>({});
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openHours, setOpenHours] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const db = createSupabaseBrowserClient();
    const [{ data: auth }, { data: project }] = await Promise.all([
      db.auth.getUser(),
      db.from("projects").select("id").eq("code", "24-018").single(),
    ]);
    if (!project || !auth.user) {
      setLoading(false);
      return;
    }
    const weekday = new Date(`${workDate}T12:00:00`).getDay();
    const [{ data: persons }, { data: schedules }, { data: attendance }] =
      await Promise.all([
        db
          .from("people")
          .select("id,full_name,qualification,contract_type")
          .eq("project_id", project.id)
          .eq("active", true)
          .order("full_name"),
        db
          .from("project_work_schedules")
          .select("*")
          .eq("project_id", project.id)
          .eq("weekday", weekday)
          .maybeSingle(),
        db
          .from("daily_attendance")
          .select(
            "id,person_id,status,arrival_time,departure_time,scheduled_hours,regular_hours,automatic_overtime_hours,manual_overtime_hours,created_by",
          )
          .eq("project_id", project.id)
          .eq("work_date", workDate),
      ]);
    const byPerson: Record<string, Attendance> = {};
    for (const row of attendance || [])
      byPerson[row.person_id] = {
        ...row,
        scheduled_hours: Number(row.scheduled_hours),
        regular_hours: Number(row.regular_hours),
        automatic_overtime_hours: Number(row.automatic_overtime_hours),
        manual_overtime_hours:
          row.manual_overtime_hours === null
            ? null
            : Number(row.manual_overtime_hours),
      } as Attendance;
    setProjectId(project.id);
    setUserId(auth.user.id);
    setPeople((persons || []) as Person[]);
    setSchedule(
      schedules
        ? ({
            ...schedules,
            theoretical_hours: Number(schedules.theoretical_hours),
          } as WorkSchedule)
        : undefined,
    );
    setRows(byPerson);
    setLoading(false);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [workDate]);

  function rowFor(personId: string): Attendance {
    return (
      rows[personId] || {
        person_id: personId,
        status: "non_renseigne",
        arrival_time: null,
        departure_time: null,
        scheduled_hours: 0,
        regular_hours: 0,
        automatic_overtime_hours: 0,
        manual_overtime_hours: null,
      }
    );
  }
  function change(personId: string, patch: Partial<Attendance>) {
    setRows((current) => {
      const base = current[personId] || rowFor(personId);
      const next = { ...base, ...patch };
      const calc = calculateAttendance(
        schedule,
        next.status,
        shortTime(next.arrival_time),
        shortTime(next.departure_time),
      );
      return {
        ...current,
        [personId]: {
          ...next,
          scheduled_hours: calc.scheduled,
          regular_hours: calc.regular,
          automatic_overtime_hours: calc.overtime,
          ...(next.status !== "present"
            ? {
                arrival_time: null,
                departure_time: null,
                manual_overtime_hours: null,
              }
            : {}),
        },
      };
    });
  }
  function markPresent(personId: string) {
    const current = rowFor(personId);
    change(personId, {
      status: current.status === "present" ? "non_renseigne" : "present",
    });
  }
  function markAbsent(personId: string) {
    const current = rowFor(personId);
    const isAbsent =
      current.status !== "present" && current.status !== "non_renseigne";
    change(personId, { status: isAbsent ? "non_renseigne" : "absent" });
  }
  function markAllPresent() {
    for (const person of people)
      if (rowFor(person.id).status === "non_renseigne")
        change(person.id, { status: "present" });
  }
  async function saveAll() {
    const missing = people.filter(
      (person) => rowFor(person.id).status === "non_renseigne",
    );
    if (missing.length) {
      toast(
        `Renseignez encore ${missing.length} personne${missing.length > 1 ? "s" : ""} : présent ou motif d’absence.`,
      );
      return;
    }
    setSaving(true);
    const db = createSupabaseBrowserClient();
    const values = people.map((person) => {
      const row = rowFor(person.id);
      return {
        project_id: projectId,
        person_id: person.id,
        work_date: workDate,
        status: row.status,
        arrival_time: row.arrival_time || null,
        departure_time: row.departure_time || null,
        scheduled_hours: row.scheduled_hours,
        regular_hours: row.regular_hours,
        automatic_overtime_hours: row.automatic_overtime_hours,
        manual_overtime_hours: row.manual_overtime_hours,
        created_by: row.created_by || userId,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await db
      .from("daily_attendance")
      .upsert(values, { onConflict: "project_id,person_id,work_date" });
    setSaving(false);
    if (error) toast(`Enregistrement impossible : ${error.message}`);
    else {
      toast(`${people.length} présences enregistrées`);
      await load();
    }
  }
  const summary = people.reduce(
    (acc, person) => {
      const row = rowFor(person.id);
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const presentCount = summary.present || 0;
  const missingCount = summary.non_renseigne || 0;
  const absentCount = people.length - presentCount - missingCount;
  const hoursLabel = (value: number) =>
    `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h`;
  if (loading)
    return (
      <div className="content page-content">
        <div className="panel empty-state">Chargement des présences…</div>
      </div>
    );
  return (
    <div className="content page-content attendance">
      <div className="attendance-head">
        <h2>Présence du matin</h2>
        <p>
          {dateLabel} ·{" "}
          {schedule?.is_working_day
            ? `${hoursLabel(schedule.theoretical_hours)} prévues, ${shortTime(schedule.start_time)} – ${shortTime(schedule.end_time)}`
            : "journée non travaillée"}
        </p>
      </div>
      <div className="attendance-summary">
        <span className="chip chip-ok">
          {presentCount} présent{presentCount > 1 ? "s" : ""}
        </span>
        <span className="chip chip-warn">
          {absentCount} absent{absentCount > 1 ? "s" : ""}
        </span>
        <span className="chip chip-neutral">{missingCount} à saisir</span>
      </div>
      {missingCount > 0 && (
        <button
          type="button"
          className="btn btn-secondary attendance-all"
          onClick={markAllPresent}
        >
          Marquer les {missingCount} restants présents
        </button>
      )}
      <ul className="attendance-list">
        {people.map((person) => {
          const row = rowFor(person.id);
          const present = row.status === "present";
          const absent = !present && row.status !== "non_renseigne";
          const overtime =
            row.manual_overtime_hours ?? row.automatic_overtime_hours;
          const showHours =
            present &&
            (openHours[person.id] ||
              Boolean(row.arrival_time || row.departure_time) ||
              row.manual_overtime_hours !== null);
          const reason = absenceReasons.find(
            ([value]) => value === row.status,
          )?.[1];
          return (
            <li
              className={`attendance-row${absent ? " is-absent" : ""}`}
              key={person.id}
            >
              <div className="attendance-person">
                <span className="avatar-initials" aria-hidden="true">
                  {person.full_name
                    .split(/\s+/)
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span className="attendance-name">
                  <b>{person.full_name}</b>
                  <small>
                    {person.qualification || "Sans qualification"}
                    {person.contract_type === "interimaire" ? " · intérim" : ""}
                    {present && row.regular_hours + overtime > 0
                      ? ` · ${hoursLabel(row.regular_hours + overtime)}`
                      : ""}
                    {absent ? ` · ${reason}` : ""}
                  </small>
                </span>
                <div
                  className="attendance-toggle"
                  role="group"
                  aria-label={`Présence de ${person.full_name}`}
                >
                  <button
                    type="button"
                    className={`btn ${present ? "btn-primary" : "btn-secondary"}`}
                    aria-pressed={present}
                    onClick={() => markPresent(person.id)}
                  >
                    Présent
                  </button>
                  <button
                    type="button"
                    className={`btn ${absent ? "btn-warn" : "btn-secondary"}`}
                    aria-pressed={absent}
                    onClick={() => markAbsent(person.id)}
                  >
                    Absent
                  </button>
                </div>
              </div>
              {absent && (
                <div
                  className="attendance-reasons"
                  role="radiogroup"
                  aria-label={`Motif d’absence de ${person.full_name}`}
                >
                  {absenceReasons
                    .filter(([value]) => value !== "non_renseigne")
                    .map(([value, label]) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={row.status === value}
                        className={`chip-button${row.status === value ? " is-selected" : ""}`}
                        key={value}
                        onClick={() => change(person.id, { status: value })}
                      >
                        {label}
                      </button>
                    ))}
                </div>
              )}
              {present && !showHours && schedule?.is_working_day && (
                <button
                  type="button"
                  className="link-button attendance-hours-toggle"
                  onClick={() =>
                    setOpenHours((current) => ({
                      ...current,
                      [person.id]: true,
                    }))
                  }
                >
                  Horaires différents ?
                </button>
              )}
              {showHours && (
                <div className="attendance-hours">
                  <label className="field">
                    Arrivée
                    <input
                      type="time"
                      value={shortTime(row.arrival_time)}
                      placeholder={shortTime(schedule?.start_time)}
                      onChange={(e) =>
                        change(person.id, { arrival_time: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Départ
                    <input
                      type="time"
                      value={shortTime(row.departure_time)}
                      placeholder={shortTime(schedule?.end_time)}
                      onChange={(e) =>
                        change(person.id, { departure_time: e.target.value })
                      }
                    />
                  </label>
                  <span className="field">
                    Heures normales
                    <strong>{hoursLabel(row.regular_hours)}</strong>
                  </span>
                  <label className="field">
                    Heures sup.
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.25"
                      value={overtime}
                      onChange={(e) =>
                        change(person.id, {
                          manual_overtime_hours: Number(e.target.value),
                        })
                      }
                    />
                    {row.manual_overtime_hours !== null && (
                      <small>
                        corrigé · calcul auto{" "}
                        {hoursLabel(row.automatic_overtime_hours)}
                      </small>
                    )}
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="attendance-save">
        <span>
          {missingCount
            ? `${missingCount} personne${missingCount > 1 ? "s" : ""} à saisir`
            : "Tout le monde est renseigné"}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !people.length}
          onClick={() => void saveAll()}
        >
          {saving
            ? "Enregistrement…"
            : `Enregistrer les ${people.length} présences`}
        </button>
      </div>
    </div>
  );
}

export function WorkScheduleSettings({
  toast,
}: {
  toast: (message: string) => void;
}) {
  const [rows, setRows] = useState<WorkSchedule[]>([]);
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  async function load() {
    const db = createSupabaseBrowserClient();
    const [{ data: auth }, { data: project }] = await Promise.all([
      db.auth.getUser(),
      db.from("projects").select("id").eq("code", "24-018").single(),
    ]);
    if (!project || !auth.user) return;
    const { data } = await db
      .from("project_work_schedules")
      .select("*")
      .eq("project_id", project.id)
      .order("weekday");
    setProjectId(project.id);
    setUserId(auth.user.id);
    setRows(
      (data || []).map((row) => ({
        ...row,
        theoretical_hours: Number(row.theoretical_hours),
      })) as WorkSchedule[],
    );
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  function update(weekday: number, patch: Partial<WorkSchedule>) {
    setRows((current) =>
      current.map((row) =>
        row.weekday === weekday ? { ...row, ...patch } : row,
      ),
    );
  }
  async function save() {
    setSaving(true);
    const db = createSupabaseBrowserClient();
    const payload = rows.map((row) => ({
      project_id: projectId,
      weekday: row.weekday,
      is_working_day: row.is_working_day,
      start_time: row.start_time,
      end_time: row.end_time,
      break_minutes: Number(row.break_minutes),
      theoretical_hours: row.is_working_day
        ? Math.max(
            0,
            (minutes(shortTime(row.end_time)) -
              minutes(shortTime(row.start_time)) -
              Number(row.break_minutes)) /
              60,
          )
        : 0,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await db
      .from("project_work_schedules")
      .upsert(payload, { onConflict: "project_id,weekday" });
    setSaving(false);
    if (error) toast(`Enregistrement impossible : ${error.message}`);
    else {
      toast("Horaires enregistrés");
      await load();
    }
  }
  return (
    <div className="panel settings-form">
      <div className="panel-title">
        <div>
          <span>HORAIRES DU CHANTIER</span>
          <h3>Planning théorique du lundi au dimanche</h3>
        </div>
      </div>
      <div className="schedule-table">
        <div className="schedule-head">
          <span>JOUR</span>
          <span>TRAVAILLÉ</span>
          <span>DÉBUT</span>
          <span>FIN</span>
          <span>PAUSE</span>
          <span>VOLUME CALCULÉ</span>
        </div>
        {rows.map((row) => {
          const theoretical = row.is_working_day
            ? Math.max(
                0,
                (minutes(shortTime(row.end_time)) -
                  minutes(shortTime(row.start_time)) -
                  Number(row.break_minutes)) /
                  60,
              )
            : 0;
          return (
            <div className="schedule-row" key={row.weekday}>
              <b>{dayNames[row.weekday]}</b>
              <input
                type="checkbox"
                checked={row.is_working_day}
                onChange={(e) =>
                  update(row.weekday, { is_working_day: e.target.checked })
                }
              />
              <input
                type="time"
                disabled={!row.is_working_day}
                value={shortTime(row.start_time)}
                onChange={(e) =>
                  update(row.weekday, { start_time: e.target.value })
                }
              />
              <input
                type="time"
                disabled={!row.is_working_day}
                value={shortTime(row.end_time)}
                onChange={(e) =>
                  update(row.weekday, { end_time: e.target.value })
                }
              />
              <label>
                <input
                  type="number"
                  min="0"
                  max="480"
                  step="15"
                  disabled={!row.is_working_day}
                  value={row.break_minutes}
                  onChange={(e) =>
                    update(row.weekday, {
                      break_minutes: Number(e.target.value),
                    })
                  }
                />
                <small>min</small>
              </label>
              <strong>
                {theoretical.toLocaleString("fr-FR", {
                  maximumFractionDigits: 2,
                })}{" "}
                h
              </strong>
            </div>
          );
        })}
      </div>
      <div className="settings-actions">
        <button
          className="primary"
          disabled={saving || !rows.length}
          onClick={() => void save()}
        >
          {saving ? "Enregistrement…" : "Enregistrer les horaires"}
        </button>
      </div>
    </div>
  );
}
