"use client";

import { useEffect, useState } from "react";
import { fetchAllRows } from "@/lib/fetch-all";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type TaskRow = {
  id: string;
  code: string;
  name: string;
  budget_hours: number;
};

export function Tasks({
  accessToken,
  toast,
}: {
  accessToken: string;
  toast: (message: string) => void;
}) {
  const [taskRows, setTaskRows] = useState<TaskRow[]>([]);
  const [spent, setSpent] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [history, setHistory] = useState<
    {
      previous_budget_hours: number;
      revised_budget_hours: number;
      reason: string;
      created_at: string;
    }[]
  >([]);
  const [showHistory, setShowHistory] = useState<TaskRow | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const db = createSupabaseBrowserClient();
    const projectId =
      (await db.from("projects").select("id").eq("code", "24-018").single())
        .data?.id ?? "";
    const [
      { data: loadedTasks, error: tasksError },
      { data: entries, error: entriesError },
    ] = await Promise.all([
      db
        .from("tasks")
        .select("id,code,name,budget_hours")
        .eq("project_id", projectId)
        .order("code"),
      fetchAllRows<{ task_id: string; hours: number | string }>((from, to) =>
        db
          .from("time_entries")
          .select("task_id,hours")
          .eq("project_id", projectId)
          .order("id")
          .range(from, to),
      ),
    ]);
    if (tasksError || entriesError) {
      toast("Impossible de charger les tâches");
      setLoading(false);
      return;
    }
    const totals: Record<string, number> = {};
    for (const entry of entries ?? [])
      totals[entry.task_id] =
        (totals[entry.task_id] ?? 0) + Number(entry.hours);
    setTaskRows((loadedTasks ?? []) as TaskRow[]);
    setSpent(totals);
    setLoading(false);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const palette = ["#397f68", "#506fa7", "#936f25", "#795b9d", "#b15e43"];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const body = editing
      ? {
          kind: "task-update",
          taskId: editing.id,
          code: String(form.get("code")),
          name: String(form.get("name")),
          budgetHours: Number(form.get("budgetHours")),
          reason: String(form.get("reason") || ""),
        }
      : {
          kind: "task-create",
          code: String(form.get("code")),
          name: String(form.get("name")),
          budgetHours: Number(form.get("budgetHours")),
        };
    const response = await fetch("/api/operations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      toast(result.error ?? "Enregistrement impossible");
      return;
    }
    setEditing(null);
    setShowNew(false);
    toast(
      editing
        ? "Tâche mise à jour et budget historisé"
        : "Nouvelle tâche créée",
    );
    void load();
  }
  async function openHistory(task: TaskRow) {
    const db = createSupabaseBrowserClient();
    const { data } = await db
      .from("task_budget_revisions")
      .select("previous_budget_hours,revised_budget_hours,reason,created_at")
      .eq("task_id", task.id)
      .order("created_at", { ascending: false });
    setHistory(data ?? []);
    setShowHistory(task);
  }
  const formTask =
    editing ?? ({ code: "", name: "", budget_hours: 0 } as TaskRow);
  return (
    <div className="content page-content">
      <div className="page-head">
        <div>
          <h2>Tâches & budgets d’heures</h2>
          <p>
            Budgets globaux par type de tâche. Leur répartition par secteur se
            configure dans Zones de travail.
          </p>
        </div>
        <button className="primary" onClick={() => setShowNew(true)}>
          ＋ Nouvelle tâche
        </button>
      </div>
      <div className="task-toolbar">
        <span>
          {taskRows.length} type{taskRows.length > 1 ? "s" : ""} de tâche ·
          budgets sans affectation de zone
        </span>
      </div>
      {loading ? (
        <div className="panel empty-state">Chargement des tâches…</div>
      ) : (
        <div className="task-cards">
          {taskRows.map((task, index) => {
            const done = spent[task.id] ?? 0;
            const budget = Number(task.budget_hours);
            const pct = budget ? Math.round((done / budget) * 100) : 0;
            const remaining = budget - done;
            return (
              <div className="panel task-card" key={task.id}>
                <div>
                  <i style={{ background: palette[index % palette.length] }} />
                  <span>
                    <small>{task.code}</small>
                    <h3>{task.name}</h3>
                  </span>
                  <em className={pct > 100 ? "over" : ""}>
                    {pct > 100
                      ? "Dépassement"
                      : pct >= 80
                        ? "À surveiller"
                        : "Dans le budget"}
                  </em>
                </div>
                <div className="numbers">
                  <span>
                    <small>BUDGET</small>
                    <b>{budget.toLocaleString("fr-FR")} h</b>
                  </span>
                  <span>
                    <small>RÉALISÉ</small>
                    <b>{done.toLocaleString("fr-FR")} h</b>
                  </span>
                  <span>
                    <small>RESTANT</small>
                    <b className={remaining < 0 ? "negative" : ""}>
                      {remaining.toLocaleString("fr-FR")} h
                    </b>
                  </span>
                </div>
                <div className="bar">
                  <i
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      background:
                        pct > 100 ? "#b15e43" : palette[index % palette.length],
                    }}
                  />
                </div>
                <small>{pct}% du budget consommé</small>
                <div className="task-card-actions">
                  <button onClick={() => setEditing(task)}>Modifier</button>
                  <button onClick={() => void openHistory(task)}>
                    Historique
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {(showNew || editing) && (
        <div className="modal-backdrop">
          <form className="task-modal" onSubmit={submit}>
            <div className="modal-title">
              <div>
                <span>{editing ? "MODIFIER LA TÂCHE" : "NOUVELLE TÂCHE"}</span>
                <h3>{editing ? editing.name : "Créer une tâche"}</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setShowNew(false);
                }}
              >
                ×
              </button>
            </div>
            <label>
              Code de tâche
              <input
                name="code"
                required
                defaultValue={formTask.code}
                placeholder="Ex. TIR-06"
              />
            </label>
            <label>
              Intitulé
              <input
                name="name"
                required
                defaultValue={formTask.name}
                placeholder="Ex. Tirage des liaisons process"
              />
            </label>
            <label>
              Budget d’heures
              <input
                name="budgetHours"
                required
                min="0"
                step="0.25"
                type="number"
                defaultValue={formTask.budget_hours}
              />
            </label>
            {editing && (
              <label>
                Motif de révision
                <textarea
                  name="reason"
                  required={
                    Number(formTask.budget_hours) !==
                    Number(editing.budget_hours)
                  }
                  placeholder="Obligatoire si le budget change"
                />
              </label>
            )}
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setShowNew(false);
                }}
              >
                Annuler
              </button>
              <button className="primary" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      )}
      {showHistory && (
        <div className="modal-backdrop">
          <div className="task-modal">
            <div className="modal-title">
              <div>
                <span>HISTORIQUE BUDGÉTAIRE</span>
                <h3>
                  {showHistory.code} · {showHistory.name}
                </h3>
              </div>
              <button onClick={() => setShowHistory(null)}>×</button>
            </div>
            {history.length ? (
              <div className="revision-list">
                {history.map((revision, index) => (
                  <div key={index}>
                    <b>
                      {Number(revision.previous_budget_hours)} h →{" "}
                      {Number(revision.revised_budget_hours)} h
                    </b>
                    <span>{revision.reason}</span>
                    <small>
                      {new Date(revision.created_at).toLocaleString("fr-FR")}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">
                Aucune révision de budget pour cette tâche.
              </p>
            )}
            <div className="modal-actions">
              <button onClick={() => setShowHistory(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
