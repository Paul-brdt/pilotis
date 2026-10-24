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

type DailyAssignment = { hours: number; taskCode: string; zoneCode: string };

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
  const [dailyAssignments, setDailyAssignments] = useState<
    Record<string, DailyAssignment[]>
  >({});
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
    const summaries = entries.reduce<Record<string, DailyAssignment[]>>(
      (result, entry) => {
        (result[entry.person_id] ??= []).push({
          hours: Number(entry.hours),
          taskCode: entry.tasks?.code ?? "Tâche inconnue",
          zoneCode: entry.zones?.code ?? "Sans zone",
        });
        return result;
      },
      {},
    );
    setDayEntries(entries);
    setEntryDraft(null);
    setPeopleRows((persons ?? []) as unknown as PersonRow[]);
    setTaskRows((loadedTasks ?? []) as WorkTask[]);
    setZoneRows((loadedZones ?? []) as WorkZone[]);
    setAssignedHours(totals);
    setDailyAssignments(summaries);
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
  const currentTask = taskRows.find((task) => task.id === taskId);
  const selectedZone = zoneRows.find((zone) => zone.id === zoneId);
  const availableTasks = taskRows;
  const availableZones = zoneRows;
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
  if (loading)
    return (
      <div className="content page-content">
        <div className="panel empty-state">
          Chargement des personnes actives…
        </div>
      </div>
    );
  return (
    <div className="content page-content">
      <div className="page-head">
        <div>
          <h2>Affectations du {dateLabel}</h2>
          <p>
            Sélectionnez plusieurs collaborateurs pour leur appliquer la même
            affectation.
          </p>
        </div>
        <span className="status">● Brouillon</span>
      </div>
      <div className="entry-layout">
        <div className="panel personnel">
          <div className="panel-title">
            <div>
              <span>PERSONNEL ACTIF</span>
              <h3>
                {peopleRows.length} collaborateur
                {peopleRows.length > 1 ? "s" : ""}
              </h3>
            </div>
            <button
              onClick={() =>
                setSelectedIds(
                  selectedIds.length === peopleRows.length
                    ? []
                    : peopleRows.map((person) => person.id),
                )
              }
            >
              {selectedIds.length === peopleRows.length
                ? "Tout désélectionner"
                : "Tout sélectionner"}
            </button>
          </div>
          {peopleRows.map((person) => {
            const totalHours = assignedHours[person.id] ?? 0;
            const assignments = dailyAssignments[person.id] ?? [];
            const attendance = attendanceTargets[person.id];
            const targetHours =
              attendance?.status === "present"
                ? Number(attendance.regular_hours) +
                  Number(
                    attendance.manual_overtime_hours ??
                      attendance.automatic_overtime_hours,
                  )
                : 0;
            const remainingHours = targetHours - totalHours;
            return (
              <label
                className={`person-check ${selectedIds.includes(person.id) ? "selected" : ""}`}
                key={person.id}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(person.id)}
                  onChange={() => toggle(person.id)}
                />
                <span>
                  {person.full_name
                    .split(/\s+/)
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div className="person-summary">
                  <b>{person.full_name}</b>
                  <small>
                    {person.qualification ?? "Qualification non renseignée"} ·{" "}
                    {person.contract_type === "interimaire"
                      ? "Intérimaire"
                      : "Interne"}
                  </small>
                  {assignments.length > 0 && (
                    <span className="assignment-summary">
                      {assignments.map((assignment, index) => (
                        <small
                          key={`${assignment.taskCode}-${assignment.zoneCode}-${index}`}
                        >
                          {assignment.taskCode} /{" "}
                          {assignment.hours.toLocaleString("fr-FR", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          h / {assignment.zoneCode}
                        </small>
                      ))}
                    </span>
                  )}
                </div>
                <em
                  className={
                    totalHours ? "assigned-hours" : "assigned-hours empty"
                  }
                >
                  {totalHours.toLocaleString("fr-FR", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  h
                  {attendance && (
                    <small
                      className={
                        remainingHours < 0
                          ? "over"
                          : remainingHours > 0
                            ? "under"
                            : "complete"
                      }
                    >
                      {targetHours.toLocaleString("fr-FR", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      h cible ·{" "}
                      {remainingHours > 0
                        ? `${remainingHours.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h restantes`
                        : remainingHours < 0
                          ? `${Math.abs(remainingHours).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h en trop`
                          : "complet"}
                    </small>
                  )}
                </em>
              </label>
            );
          })}
        </div>
        <div className="panel allocation">
          <span>AFFECTATION GROUPÉE</span>
          <h3>
            {selectedIds.length
              ? `${selectedIds.length} personne${selectedIds.length > 1 ? "s" : ""} sélectionnée${selectedIds.length > 1 ? "s" : ""}`
              : "Choisissez les collaborateurs"}
          </h3>
          <div className="form-grid">
            <label>
              Tâche
              <select
                value={taskId}
                onChange={(event) => {
                  setTaskId(event.target.value);
                }}
              >
                {availableTasks.map((task) => (
                  <option value={task.id} key={task.id}>
                    {task.code} · {task.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Durée
              <input
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
              <small>heures</small>
            </label>
          </div>
          <label>
            Zone de travail
            <select
              value={zoneId}
              onChange={(event) => setZoneId(event.target.value)}
            >
              {availableZones.map((zone) => (
                <option value={zone.id} key={zone.id}>
                  {zone.code} · {zone.name}
                </option>
              ))}
            </select>
          </label>
          <div className="allocation-card">
            <i style={{ background: "#397f68" }} />
            <div>
              <b>{currentTask?.name ?? "Aucune tâche"}</b>
              <small>
                {currentTask?.code ?? ""} ·{" "}
                {selectedZone?.name ?? "Aucune zone"}
              </small>
            </div>
            <strong>{hours || 0} h</strong>
          </div>
          <label>
            Commentaire
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Précision facultative sur les travaux réalisés…"
            />
          </label>
          <div className="day-total">
            <span>Total à enregistrer</span>
            <b>
              {(Number(hours || 0) * selectedIds.length).toLocaleString(
                "fr-FR",
              )}{" "}
              h
            </b>
            <div className="bar">
              <i style={{ width: `${Math.min(Number(hours) * 12.5, 100)}%` }} />
            </div>
          </div>
          <button
            className="save"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Enregistrement…" : "Enregistrer les affectations"}
          </button>
        </div>
      </div>
      <div className="panel time-entries">
        <div className="panel-title">
          <div>
            <span>HEURES SAISIES</span>
            <h3>
              {dayEntries.length
                ? `${dayEntries.length} ligne${dayEntries.length > 1 ? "s" : ""} le ${dateLabel}`
                : "Aucune heure saisie ce jour"}
            </h3>
          </div>
        </div>
        {dayEntries.length > 0 && (
          <div className="time-entries-scroll">
            <table>
              <thead>
                <tr>
                  <th>COLLABORATEUR</th>
                  <th>TÂCHE</th>
                  <th>ZONE</th>
                  <th>HEURES</th>
                  <th>COMMENTAIRE</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dayEntries.map((entry) => {
                  const personName =
                    peopleRows.find((person) => person.id === entry.person_id)
                      ?.full_name ?? "Collaborateur inactif";
                  const draft = entryDraft?.id === entry.id ? entryDraft : null;
                  return (
                    <tr key={entry.id}>
                      <td>
                        <b>{personName}</b>
                      </td>
                      {draft ? (
                        <>
                          <td>
                            <select
                              aria-label="Tâche"
                              value={draft.taskId}
                              onChange={(event) =>
                                setEntryDraft({
                                  ...draft,
                                  taskId: event.target.value,
                                })
                              }
                            >
                              {taskRows.map((task) => (
                                <option value={task.id} key={task.id}>
                                  {task.code} · {task.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <select
                              aria-label="Zone"
                              value={draft.zoneId}
                              onChange={(event) =>
                                setEntryDraft({
                                  ...draft,
                                  zoneId: event.target.value,
                                })
                              }
                            >
                              {zoneRows.map((zone) => (
                                <option value={zone.id} key={zone.id}>
                                  {zone.code} · {zone.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              aria-label="Heures"
                              type="number"
                              min="0.25"
                              max="24"
                              step="0.25"
                              value={draft.hours}
                              onChange={(event) =>
                                setEntryDraft({
                                  ...draft,
                                  hours: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              aria-label="Commentaire"
                              value={draft.comment}
                              onChange={(event) =>
                                setEntryDraft({
                                  ...draft,
                                  comment: event.target.value,
                                })
                              }
                            />
                          </td>
                          <td className="time-entry-actions">
                            <button
                              className="primary"
                              disabled={saving}
                              onClick={() => void saveEntry()}
                            >
                              Enregistrer
                            </button>
                            <button
                              disabled={saving}
                              onClick={() => setEntryDraft(null)}
                            >
                              Annuler
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{entry.tasks?.code ?? "Tâche inconnue"}</td>
                          <td>{entry.zones?.code ?? "Sans zone"}</td>
                          <td>
                            <strong>
                              {Number(entry.hours).toLocaleString("fr-FR", {
                                maximumFractionDigits: 2,
                              })}{" "}
                              h
                            </strong>
                          </td>
                          <td>{entry.comment || "—"}</td>
                          <td className="time-entry-actions">
                            <button
                              disabled={saving}
                              onClick={() =>
                                setEntryDraft({
                                  id: entry.id,
                                  taskId: entry.task_id,
                                  zoneId:
                                    entry.zone_id ?? zoneRows[0]?.id ?? "",
                                  hours: String(Number(entry.hours)),
                                  comment: entry.comment ?? "",
                                })
                              }
                            >
                              Modifier
                            </button>
                            <button
                              className="danger-button"
                              disabled={saving}
                              onClick={() =>
                                void deleteEntry(entry, personName)
                              }
                            >
                              Supprimer
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
