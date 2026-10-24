"use client";

import { useEffect, useState } from "react";
import type { PersonRow } from "@/app/shared";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type WorkTask = {
  id: string;
  code: string;
  name: string;
};

type WorkZone = { id: string; code: string; name: string };

type DailyTimeEntry = {
  id: string;
  person_id: string;
  task_id: string;
  zone_id: string | null;
  hours: number | string;
  comment: string | null;
  tasks: { code: string } | null;
  zones: { code: string } | null;
};

type EntryDraft = {
  id: string;
  taskId: string;
  zoneId: string;
  hours: string;
  comment: string;
};

type DailyAttendanceTarget = {
  person_id: string;
  status: string;
  scheduled_hours: number | string;
  regular_hours: number | string;
  automatic_overtime_hours: number | string;
  manual_overtime_hours: number | string | null;
};

export function Pointage({
  accessToken,
  workDate,
  dateLabel,
  toast,
}: {
  accessToken: string;
  workDate: string;
  dateLabel: string;
  toast: (s: string) => void;
}) {
  const [peopleRows, setPeopleRows] = useState<PersonRow[]>([]);
  const [taskRows, setTaskRows] = useState<WorkTask[]>([]);
  const [zoneRows, setZoneRows] = useState<WorkZone[]>([]);
  const [assignedHours, setAssignedHours] = useState<Record<string, number>>(
    {},
  );
  const [attendanceTargets, setAttendanceTargets] = useState<
    Record<string, DailyAttendanceTarget>
  >({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [taskId, setTaskId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [hours, setHours] = useState("8");
  const [comment, setComment] = useState("");
  const [dayEntries, setDayEntries] = useState<DailyTimeEntry[]>([]);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  async function load() {
    setLoading(true);
    const db = createSupabaseBrowserClient();
    const project = (
      await db.from("projects").select("id").eq("code", "24-018").single()
    ).data;
    if (!project) {
      setLoading(false);
      return;
    }
    const [
      { data: persons },
      { data: loadedTasks },
      { data: loadedZones },
      { data: dailyEntries },
      { data: attendance },
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
        .select("id,code,name")
        .eq("project_id", project.id)
        .order("code"),
      db
        .from("zones")
        .select("id,code,name")
        .eq("project_id", project.id)
        .order("code"),
      db
        .from("time_entries")
        .select(
          "id,person_id,task_id,zone_id,hours,comment,tasks(code),zones(code)",
        )
        .eq("project_id", project.id)
        .eq("work_date", workDate)
        .order("created_at", { ascending: true }),
      db
        .from("daily_attendance")
        .select(
          "person_id,status,scheduled_hours,regular_hours,automatic_overtime_hours,manual_overtime_hours",
        )
        .eq("project_id", project.id)
        .eq("work_date", workDate),
    ]);
    const entries = (dailyEntries ?? []) as unknown as DailyTimeEntry[];
    const totals = entries.reduce<Record<string, number>>((result, entry) => {
      result[entry.person_id] =
        (result[entry.person_id] ?? 0) + Number(entry.hours);
      return result;
    }, {});
    setDayEntries(entries);
    setEntryDraft(null);
    setPeopleRows((persons ?? []) as unknown as PersonRow[]);
    setTaskRows((loadedTasks ?? []) as WorkTask[]);
    setZoneRows((loadedZones ?? []) as WorkZone[]);
    setAssignedHours(totals);
    setAttendanceTargets(
      Object.fromEntries(
        ((attendance ?? []) as DailyAttendanceTarget[]).map((row) => [
          row.person_id,
          row,
        ]),
      ),
    );
    setTaskId((current) =>
      loadedTasks?.some((task) => task.id === current)
        ? current
        : loadedTasks?.[0]?.id || "",
    );
    setZoneId((current) =>
      loadedZones?.some((zone) => zone.id === current)
        ? current
        : loadedZones?.[0]?.id || "",
    );
    setLoading(false);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [workDate]);
  const hoursLabel = (value: number) =>
    `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h`;
  // Hours a person can still be assigned today: what the morning attendance
  // recorded (normal + overtime) minus what is already booked.
  function targetHours(personId: string) {
    const attendance = attendanceTargets[personId];
    if (attendance?.status !== "present") return 0;
    return (
      Number(attendance.regular_hours) +
      Number(
        attendance.manual_overtime_hours ?? attendance.automatic_overtime_hours,
      )
    );
  }
  const remainingFor = (personId: string) =>
    targetHours(personId) - (assignedHours[personId] ?? 0);
  const presentPeople = peopleRows.filter(
    (person) => attendanceTargets[person.id]?.status === "present",
  );
  const otherPeople = peopleRows.filter(
    (person) => attendanceTargets[person.id]?.status !== "present",
  );
  const toAssign = presentPeople.reduce(
    (sum, person) => sum + Math.max(0, remainingFor(person.id)),
    0,
  );
  const overBooked = peopleRows.reduce(
    (sum, person) => sum + Math.max(0, -remainingFor(person.id)),
    0,
  );
  const openPeople = presentPeople.filter(
    (person) => remainingFor(person.id) > 0,
  );
  function stepHours(delta: number) {
    setHours((current) =>
      String(Math.min(24, Math.max(0.5, (Number(current) || 0) + delta))),
    );
  }
  function selectOpenPeople() {
    setSelectedIds(
      selectedIds.length === openPeople.length
        ? []
        : openPeople.map((person) => person.id),
    );
  }
  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }
  async function send(body: Record<string, unknown>) {
    const response = await fetch("/api/operations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "Enregistrement impossible");
  }
  async function saveEntry() {
    if (!entryDraft) return;
    setSaving(true);
    try {
      await send({
        kind: "time-update",
        entryId: entryDraft.id,
        taskId: entryDraft.taskId,
        zoneId: entryDraft.zoneId,
        hours: Number(entryDraft.hours),
        comment: entryDraft.comment,
      });
      toast("Pointage corrigé");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Correction impossible");
    } finally {
      setSaving(false);
    }
  }
  async function deleteEntry(entry: DailyTimeEntry, personName: string) {
    if (
      !window.confirm(
        `Supprimer ${Number(entry.hours).toLocaleString("fr-FR")} h de ${personName} sur ${entry.tasks?.code ?? "cette tâche"} ?`,
      )
    )
      return;
    setSaving(true);
    try {
      await send({ kind: "time-delete", entryId: entry.id });
      toast("Pointage supprimé");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setSaving(false);
    }
  }
  async function save() {
    if (!selectedIds.length || !taskId || !zoneId || !Number(hours)) {
      toast(
        "Sélectionnez au moins une personne, une tâche, une zone et une durée.",
      );
      return;
    }
    setSaving(true);
    const response = await fetch("/api/operations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        kind: "time-bulk",
        workDate,
        personIds: selectedIds,
        taskId,
        zoneId,
        hours: Number(hours),
        comment,
      }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      toast(result.error ?? "Le pointage n’a pas pu être enregistré");
      return;
    }
    toast(
      `${selectedIds.length} pointage${selectedIds.length > 1 ? "s" : ""} enregistré${selectedIds.length > 1 ? "s" : ""}`,
    );
    setSelectedIds([]);
    setComment("");
    await load();
  }
  function personRow(person: PersonRow) {
    const target = targetHours(person.id);
    const assigned = assignedHours[person.id] ?? 0;
    const remaining = target - assigned;
    const status = attendanceTargets[person.id]?.status;
    const state =
      status !== "present"
        ? {
            className: "chip-neutral",
            label: status ? "Absent" : "Présence non saisie",
          }
        : remaining > 0
          ? {
              className: "chip-warn",
              label: `${hoursLabel(remaining)} restantes`,
            }
          : remaining < 0
            ? {
                className: "chip-danger",
                label: `${hoursLabel(-remaining)} en trop`,
              }
            : { className: "chip-ok", label: "Complet" };
    const checked = selectedIds.includes(person.id);
    return (
      <label
        className={`assign-person${checked ? " is-selected" : ""}`}
        key={person.id}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggle(person.id)}
        />
        <span className="assign-person-name">
          <b>{person.full_name}</b>
          <small>
            {status === "present"
              ? `${hoursLabel(target)} présent · ${hoursLabel(assigned)} affectée${assigned > 1 ? "s" : ""}`
              : person.qualification || "Sans qualification"}
          </small>
        </span>
        <span className={`chip ${state.className}`}>{state.label}</span>
      </label>
    );
  }
  if (loading)
    return (
      <div className="content page-content">
        <div className="panel empty-state">
          Chargement des personnes actives…
        </div>
      </div>
    );
  const total = Number(hours || 0) * selectedIds.length;
  return (
    <div className="content page-content assign">
      <div className="assign-head">
        <div>
          <h2>Affectation des heures</h2>
          <p>{dateLabel}</p>
        </div>
        <span className="assign-status">
          {toAssign > 0 && (
            <span className="chip chip-warn">
              {hoursLabel(toAssign)} à affecter
            </span>
          )}
          {overBooked > 0 && (
            <span className="chip chip-danger">
              {hoursLabel(overBooked)} au-delà de la présence
            </span>
          )}
          {toAssign === 0 && overBooked === 0 && (
            <span className="chip chip-ok">Tout est affecté</span>
          )}
        </span>
      </div>

      <section className="assign-card" aria-labelledby="assign-where">
        <h3 id="assign-where">1 · Quoi et où</h3>
        <div className="assign-fields">
          <label className="field">
            Tâche
            <select
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
            >
              {taskRows.map((task) => (
                <option value={task.id} key={task.id}>
                  {task.code} · {task.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Zone
            <select
              value={zoneId}
              onChange={(event) => setZoneId(event.target.value)}
            >
              {zoneRows.map((zone) => (
                <option value={zone.id} key={zone.id}>
                  {zone.code} · {zone.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="assign-card assign-who" aria-labelledby="assign-who">
        <div className="assign-card-head">
          <h3 id="assign-who">2 · Qui</h3>
          {openPeople.length > 0 && (
            <button
              type="button"
              className="link-button"
              onClick={selectOpenPeople}
            >
              {selectedIds.length === openPeople.length
                ? "Tout décocher"
                : "Cocher ceux qui ont des heures restantes"}
            </button>
          )}
        </div>
        {presentPeople.length === 0 && (
          <p className="assign-empty">
            Aucune présence enregistrée ce jour : saisissez d’abord la présence
            du matin.
          </p>
        )}
        {presentPeople.map(personRow)}
        {otherPeople.length > 0 && (
          <details className="assign-others">
            <summary>
              {otherPeople.length} personne
              {otherPeople.length > 1 ? "s" : ""} non présente
              {otherPeople.length > 1 ? "s" : ""}
            </summary>
            {otherPeople.map(personRow)}
          </details>
        )}
      </section>

      <section className="assign-card" aria-labelledby="assign-how-much">
        <div className="assign-hours">
          <h3 id="assign-how-much">3 · Combien</h3>
          <div className="stepper">
            <button
              type="button"
              className="btn btn-secondary"
              aria-label="Retirer une demi-heure"
              onClick={() => stepHours(-0.5)}
            >
              −
            </button>
            <label>
              <span className="sr-only">Heures par personne</span>
              <input
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
              <span aria-hidden="true">h</span>
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              aria-label="Ajouter une demi-heure"
              onClick={() => stepHours(0.5)}
            >
              +
            </button>
          </div>
        </div>
        <label className="field">
          Commentaire (facultatif)
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Précision sur les travaux réalisés"
          />
        </label>
      </section>

      <section className="assign-done" aria-labelledby="assign-done">
        <h3 id="assign-done">
          {dayEntries.length
            ? `Déjà saisi le ${dateLabel}`
            : "Aucune heure saisie ce jour"}
        </h3>
        {dayEntries.map((entry) => {
          const personName =
            peopleRows.find((person) => person.id === entry.person_id)
              ?.full_name ?? "Collaborateur inactif";
          const draft = entryDraft?.id === entry.id ? entryDraft : null;
          return (
            <div className="assign-entry" key={entry.id}>
              <div className="assign-entry-main">
                <span>
                  <b>
                    {personName} · {hoursLabel(Number(entry.hours))}
                  </b>
                  <small>
                    {entry.tasks?.code ?? "Tâche inconnue"} ·{" "}
                    {entry.zones?.code ?? "Sans zone"}
                    {entry.comment ? ` · ${entry.comment}` : ""}
                  </small>
                </span>
                {!draft && (
                  <span className="assign-entry-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={saving}
                      onClick={() =>
                        setEntryDraft({
                          id: entry.id,
                          taskId: entry.task_id,
                          zoneId: entry.zone_id ?? zoneRows[0]?.id ?? "",
                          hours: String(Number(entry.hours)),
                          comment: entry.comment ?? "",
                        })
                      }
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={saving}
                      onClick={() => void deleteEntry(entry, personName)}
                    >
                      Supprimer
                    </button>
                  </span>
                )}
              </div>
              {draft && (
                <div className="assign-entry-edit">
                  <label className="field">
                    Tâche
                    <select
                      value={draft.taskId}
                      onChange={(event) =>
                        setEntryDraft({ ...draft, taskId: event.target.value })
                      }
                    >
                      {taskRows.map((task) => (
                        <option value={task.id} key={task.id}>
                          {task.code} · {task.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Zone
                    <select
                      value={draft.zoneId}
                      onChange={(event) =>
                        setEntryDraft({ ...draft, zoneId: event.target.value })
                      }
                    >
                      {zoneRows.map((zone) => (
                        <option value={zone.id} key={zone.id}>
                          {zone.code} · {zone.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Heures
                    <input
                      type="number"
                      min="0.25"
                      max="24"
                      step="0.25"
                      value={draft.hours}
                      onChange={(event) =>
                        setEntryDraft({ ...draft, hours: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    Commentaire
                    <input
                      value={draft.comment}
                      onChange={(event) =>
                        setEntryDraft({ ...draft, comment: event.target.value })
                      }
                    />
                  </label>
                  <span className="assign-entry-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={saving}
                      onClick={() => void saveEntry()}
                    >
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={saving}
                      onClick={() => setEntryDraft(null)}
                    >
                      Annuler
                    </button>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <div className="assign-save">
        <span>
          {selectedIds.length
            ? `${hoursLabel(total)} au total`
            : "Cochez au moins une personne"}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !selectedIds.length || !Number(hours)}
          onClick={() => void save()}
        >
          {saving
            ? "Enregistrement…"
            : selectedIds.length
              ? `Affecter ${hoursLabel(Number(hours || 0))} à ${selectedIds.length} personne${selectedIds.length > 1 ? "s" : ""}`
              : "Affecter les heures"}
        </button>
      </div>
    </div>
  );
}
