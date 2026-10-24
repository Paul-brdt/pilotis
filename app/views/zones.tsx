"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/app/ui/icons";
import { Kpi } from "@/app/ui/kpi";
import { fetchAllRows } from "@/lib/fetch-all";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type ManagedZone = {
  id: string;
  code: string;
  name: string;
  physical_progress: number;
};

export function Zones({
  accessToken,
  toast,
}: {
  accessToken: string;
  toast: (message: string) => void;
}) {
  type ZoneTask = {
    id: string;
    code: string;
    name: string;
    budget_hours: number;
  };
  type ZoneAllocation = {
    id: string;
    zone_id: string;
    task_id: string;
    allocated_hours: number;
    done: number;
  };
  const [managedZones, setManagedZones] = useState<ManagedZone[]>([]);
  const [zoneTasks, setZoneTasks] = useState<ZoneTask[]>([]);
  const [allocations, setAllocations] = useState<ZoneAllocation[]>([]);
  const [zoneHours, setZoneHours] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingZone, setEditingZone] = useState<ManagedZone | null>(null);
  const [showZone, setShowZone] = useState(false);
  const [showAllocation, setShowAllocation] = useState(false);
  const [editingAllocation, setEditingAllocation] =
    useState<ZoneAllocation | null>(null);
  const [allocationTaskId, setAllocationTaskId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const db = createSupabaseBrowserClient();
    const [
      { data: zoneData, error: zoneError },
      { data: taskData },
      { data: allocationData },
      { data: entries, error: entriesError },
    ] = await Promise.all([
      db.from("zones").select("id,code,name,physical_progress").order("code"),
      db.from("tasks").select("id,code,name,budget_hours").order("code"),
      db
        .from("zone_task_budget_allocations")
        .select("id,zone_id,task_id,allocated_hours"),
      fetchAllRows<{
        task_id: string;
        zone_id: string | null;
        hours: number | string;
      }>((from, to) =>
        db
          .from("time_entries")
          .select("task_id,zone_id,hours")
          .order("id")
          .range(from, to),
      ),
    ]);
    if (zoneError || entriesError) {
      setError("Impossible de charger les zones de travail.");
      setLoading(false);
      return;
    }
    const loadedZones = (zoneData ?? []) as ManagedZone[];
    const doneByTaskAndZone = new Map<string, number>();
    // Every hour booked on a zone counts, whether or not its task has a
    // budget allocated to that zone.
    const hoursByZone: Record<string, number> = {};
    for (const entry of entries ?? []) {
      if (entry.zone_id)
        hoursByZone[entry.zone_id] =
          (hoursByZone[entry.zone_id] ?? 0) + Number(entry.hours);
      const key = `${entry.task_id}:${entry.zone_id}`;
      doneByTaskAndZone.set(
        key,
        (doneByTaskAndZone.get(key) ?? 0) + Number(entry.hours),
      );
    }
    setManagedZones(loadedZones);
    setZoneHours(hoursByZone);
    setZoneTasks(
      (taskData ?? []).map((task) => ({
        ...task,
        budget_hours: Number(task.budget_hours),
      })) as ZoneTask[],
    );
    setAllocations(
      (allocationData ?? []).map((allocation) => ({
        ...allocation,
        allocated_hours: Number(allocation.allocated_hours),
        done:
          doneByTaskAndZone.get(
            `${allocation.task_id}:${allocation.zone_id}`,
          ) ?? 0,
      })) as ZoneAllocation[],
    );
    setSelectedId((current) =>
      loadedZones.some((zone) => zone.id === current)
        ? current
        : (loadedZones[0]?.id ?? null),
    );
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function saveZone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          kind: editingZone ? "zone-update" : "zone-create",
          zoneId: editingZone?.id,
          code: String(form.get("code") ?? ""),
          name: String(form.get("name") ?? ""),
          physicalProgress: Number(form.get("physicalProgress") ?? 0),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Enregistrement impossible");
      toast(editingZone ? "Zone mise à jour" : "Nouvelle zone créée");
      setShowZone(false);
      setEditingZone(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function saveAllocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/operations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          kind: "zone-allocation-save",
          allocationId: editingAllocation?.id,
          zoneId: selectedId,
          taskId: String(form.get("taskId") ?? ""),
          allocatedHours: Number(form.get("allocatedHours")),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Allocation impossible");
      toast(
        editingAllocation
          ? "Allocation mise à jour"
          : "Budget alloué à la zone",
      );
      setShowAllocation(false);
      setEditingAllocation(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAllocation(allocation: ZoneAllocation) {
    if (!selectedId) return;
    setSaving(true);
    const response = await fetch("/api/operations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        kind: "zone-allocation-delete",
        allocationId: allocation.id,
        zoneId: selectedId,
        taskId: allocation.task_id,
      }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return setError(result.error ?? "Suppression impossible");
    toast("Allocation supprimée");
    await load();
  }

  if (loading)
    return (
      <div className="content page-content">
        <div className="panel empty-state">Chargement des zones…</div>
      </div>
    );

  const z = managedZones.find((zone) => zone.id === selectedId) ?? null;
  const allocationsForZone = allocations.filter(
    (allocation) => allocation.zone_id === z?.id,
  );
  const tasksForZone = allocationsForZone.flatMap((allocation) => {
    const task = zoneTasks.find((item) => item.id === allocation.task_id);
    return task
      ? [
          {
            ...task,
            allocationId: allocation.id,
            allocated_hours: allocation.allocated_hours,
            done: allocation.done,
          },
        ]
      : [];
  });
  const budget = tasksForZone.reduce(
    (sum, task) => sum + task.allocated_hours,
    0,
  );
  const done = z ? (zoneHours[z.id] ?? 0) : 0;
  const consumption = budget ? Math.round((done / budget) * 100) : 0;
  const allBudget = allocations.reduce(
    (sum, allocation) => sum + allocation.allocated_hours,
    0,
  );
  const allDone = Object.values(zoneHours).reduce(
    (sum, hours) => sum + hours,
    0,
  );
  const zoneBudgetOf = (zoneId: string) =>
    allocations
      .filter((allocation) => allocation.zone_id === zoneId)
      .reduce((sum, allocation) => sum + allocation.allocated_hours, 0);
  // Same rule as the overview: weighted by each zone's allocated budget.
  const averageProgress = managedZones.length
    ? Math.round(
        allBudget
          ? managedZones.reduce(
              (sum, zone) =>
                sum + zoneBudgetOf(zone.id) * Number(zone.physical_progress),
              0,
            ) / allBudget
          : managedZones.reduce(
              (sum, zone) => sum + Number(zone.physical_progress),
              0,
            ) / managedZones.length,
      )
    : 0;
  const hoursLabel = (value: number) =>
    `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h`;
  const colors = ["#397f68", "#506fa7", "#936f25", "#795b9d", "#b15e43"];
  return (
    <div className="content page-content">
      <div className="page-head">
        <div>
          <h2>Récapitulatif par zone</h2>
          <p>
            Visualisez les tâches, les heures consommées et l’avancement
            physique par secteur.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditingZone(null);
            setShowZone(true);
          }}
        >
          <Icon name="plus" /> Nouvelle zone
        </button>
      </div>
      {error && <div className="settings-error">{error}</div>}
      <div className="zone-overview">
        <Kpi
          label="ZONES ACTIVES"
          value={String(managedZones.length)}
          detail={`${allocations.length} budget${allocations.length > 1 ? "s" : ""} réparti${allocations.length > 1 ? "s" : ""} par zone`}
          tone="green"
        />
        <Kpi
          label="AVANCEMENT MOYEN"
          value={`${averageProgress}%`}
          detail={
            allBudget
              ? "moyenne pondérée par le budget des zones"
              : "moyenne simple des zones"
          }
          tone="blue"
          progress={averageProgress}
        />
        <Kpi
          label="HEURES CONSOMMÉES"
          value={hoursLabel(allDone)}
          detail={`pour ${hoursLabel(allBudget)} réparties sur les zones`}
          tone="gold"
        />
        <Kpi
          label="ZONE SÉLECTIONNÉE"
          value={z?.code ?? "—"}
          detail={z?.name ?? "Aucune zone configurée"}
          tone="red"
        />
      </div>
      <div className="zones-layout">
        <div className="zone-list">
          {managedZones.map((zone, index) => {
            const relatedTasks = allocations.filter(
              (allocation) => allocation.zone_id === zone.id,
            );
            const zoneBudget = relatedTasks.reduce(
              (sum, allocation) => sum + allocation.allocated_hours,
              0,
            );
            const zoneDone = zoneHours[zone.id] ?? 0;
            const pct = zoneBudget
              ? Math.round((zoneDone / zoneBudget) * 100)
              : 0;
            const color = colors[index % colors.length];
            return (
              <button
                key={zone.id}
                className={`panel zone-card ${selectedId === zone.id ? "selected" : ""}`}
                onClick={() => setSelectedId(zone.id)}
              >
                <div className="zone-card-head">
                  <i style={{ background: color }} />
                  <span>
                    <small>{zone.code}</small>
                    <b>{zone.name}</b>
                  </span>
                  <em className={pct > 100 ? "warning" : ""}>
                    {pct > 100 ? "Dépassement" : "En cours"}
                  </em>
                </div>
                <div className="zone-metrics">
                  <span>
                    <small>AVANCEMENT</small>
                    <b>{Number(zone.physical_progress)}%</b>
                  </span>
                  <span>
                    <small>HEURES</small>
                    <b>
                      {zoneBudget
                        ? `${hoursLabel(zoneDone)} / ${hoursLabel(zoneBudget)}`
                        : hoursLabel(zoneDone)}
                    </b>
                  </span>
                  <span>
                    <small>TÂCHES</small>
                    <b>{relatedTasks.length}</b>
                  </span>
                </div>
                <div className="bar">
                  <i
                    style={{
                      width: `${Number(zone.physical_progress)}%`,
                      background: color,
                    }}
                  />
                </div>
                <small>
                  {zoneBudget
                    ? `${pct} % du budget d’heures consommé`
                    : "Aucun budget réparti sur cette zone"}
                </small>
              </button>
            );
          })}
        </div>
        {z ? (
          <div className="panel zone-detail">
            <div className="panel-title">
              <div>
                <span>DÉTAIL DE LA ZONE · {z.code}</span>
                <h3>{z.name}</h3>
              </div>
              <button
                onClick={() => {
                  setEditingZone(z);
                  setShowZone(true);
                }}
              >
                Modifier la zone
              </button>
            </div>
            <div className="zone-detail-kpis">
              <div>
                <small>AVANCEMENT GLOBAL</small>
                <b>{Number(z.physical_progress)}%</b>
                <div className="bar">
                  <i
                    style={{
                      width: `${Number(z.physical_progress)}%`,
                      background:
                        colors[
                          Math.max(
                            0,
                            managedZones.findIndex((zone) => zone.id === z.id),
                          ) % colors.length
                        ],
                    }}
                  />
                </div>
              </div>
              <div>
                <small>CONSOMMATION</small>
                <b>{budget ? `${consumption} %` : "—"}</b>
                <span>{hoursLabel(done)} réalisées</span>
              </div>
              <div>
                <small>RESTANT</small>
                <b>{budget ? hoursLabel(budget - done) : "—"}</b>
                <span>
                  {budget
                    ? "budget disponible"
                    : "aucun budget réparti sur cette zone"}
                </span>
              </div>
            </div>
            <div className="zone-task-title">
              <div>
                <b>Types de travail alloués</b>
                <span>
                  {tasksForZone.length} allocation
                  {tasksForZone.length > 1 ? "s" : ""}
                </span>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setEditingAllocation(null);
                  setAllocationTaskId("");
                  setShowAllocation(true);
                }}
              >
                <Icon name="plus" size={18} /> Allouer un budget
              </button>
            </div>
            <div className="zone-task-head">
              <span>TÂCHE</span>
              <span>BUDGET</span>
              <span>RÉALISÉ</span>
              <span>AVANCEMENT</span>
            </div>
            {tasksForZone.map((t) => {
              const p = t.allocated_hours
                ? Math.round((t.done / t.allocated_hours) * 100)
                : 0;
              return (
                <div className="zone-task-row" key={t.code}>
                  <div>
                    <i style={{ background: colors[0] }} />
                    <span>
                      <b>{t.name}</b>
                      <small>{t.code}</small>
                    </span>
                  </div>
                  <b>{t.allocated_hours} h</b>
                  <b>{t.done} h</b>
                  <div>
                    <span>{p}%</span>
                    <div className="bar">
                      <i
                        style={{
                          width: `${Math.min(p, 100)}%`,
                          background: colors[0],
                        }}
                      />
                    </div>
                    <div className="allocation-actions">
                      <button
                        onClick={() => {
                          const allocation =
                            allocations.find((a) => a.id === t.allocationId) ??
                            null;
                          setEditingAllocation(allocation);
                          setAllocationTaskId(allocation?.task_id ?? "");
                          setShowAllocation(true);
                        }}
                      >
                        Modifier
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => {
                          const allocation = allocations.find(
                            (a) => a.id === t.allocationId,
                          );
                          if (allocation) void deleteAllocation(allocation);
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="panel zone-detail empty-state">
            Créez une première zone de travail pour commencer.
          </div>
        )}
      </div>
      {showZone && (
        <div className="modal-backdrop">
          <form className="task-modal" onSubmit={saveZone}>
            <div className="modal-title">
              <div>
                <span>
                  {editingZone ? "MODIFIER LA ZONE" : "NOUVELLE ZONE"}
                </span>
                <h3>
                  {editingZone ? editingZone.name : "Créer une zone de travail"}
                </h3>
              </div>
              <button
                aria-label="Fermer"
                type="button"
                onClick={() => {
                  setShowZone(false);
                  setEditingZone(null);
                }}
              >
                <Icon name="close" />
              </button>
            </div>
            <label>
              Code de zone
              <input
                name="code"
                required
                defaultValue={editingZone?.code ?? ""}
                placeholder="Ex. Z-05"
              />
            </label>
            <label>
              Nom de la zone
              <input
                name="name"
                required
                defaultValue={editingZone?.name ?? ""}
                placeholder="Ex. Atelier logistique"
              />
            </label>
            <label>
              Avancement physique (%)
              <input
                name="physicalProgress"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                defaultValue={editingZone?.physical_progress ?? 0}
              />
            </label>
            {error && <div className="settings-error">{error}</div>}
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setShowZone(false);
                  setEditingZone(null);
                }}
              >
                Annuler
              </button>
              <button className="primary" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer la zone"}
              </button>
            </div>
          </form>
        </div>
      )}
      {showAllocation &&
        z &&
        (() => {
          const selectedTaskId = editingAllocation?.task_id ?? allocationTaskId;
          const selectedTask = zoneTasks.find(
            (task) => task.id === selectedTaskId,
          );
          const allocatedToOtherZones = selectedTask
            ? allocations
                .filter(
                  (item) =>
                    item.task_id === selectedTask.id &&
                    item.id !== editingAllocation?.id,
                )
                .reduce((sum, item) => sum + item.allocated_hours, 0)
            : 0;
          return (
            <div className="modal-backdrop">
              <form className="task-modal" onSubmit={saveAllocation}>
                <div className="modal-title">
                  <div>
                    <span>BUDGET DE ZONE · {z.code}</span>
                    <h3>
                      {editingAllocation
                        ? "Modifier l’allocation"
                        : "Allouer un type de travail"}
                    </h3>
                  </div>
                  <button
                    aria-label="Fermer"
                    type="button"
                    onClick={() => {
                      setShowAllocation(false);
                      setEditingAllocation(null);
                      setError("");
                    }}
                  >
                    <Icon name="close" />
                  </button>
                </div>
                <label>
                  Type de tâche
                  <select
                    name="taskId"
                    required
                    value={selectedTaskId}
                    disabled={Boolean(editingAllocation)}
                    onChange={(event) =>
                      setAllocationTaskId(event.target.value)
                    }
                  >
                    <option value="">Sélectionner…</option>
                    {zoneTasks.map((task) => {
                      const allocated = allocations
                        .filter(
                          (item) =>
                            item.task_id === task.id &&
                            item.id !== editingAllocation?.id,
                        )
                        .reduce((sum, item) => sum + item.allocated_hours, 0);
                      const available = Number(task.budget_hours) - allocated;
                      const alreadyInZone = allocations.some(
                        (item) =>
                          item.zone_id === z.id &&
                          item.task_id === task.id &&
                          item.id !== editingAllocation?.id,
                      );
                      return (
                        <option
                          key={task.id}
                          value={task.id}
                          disabled={alreadyInZone || available <= 0}
                        >
                          {task.code} · {task.name} —{" "}
                          {available.toLocaleString("fr-FR")} h disponibles
                        </option>
                      );
                    })}
                  </select>
                  {editingAllocation && (
                    <input
                      type="hidden"
                      name="taskId"
                      value={editingAllocation.task_id}
                    />
                  )}
                </label>
                {selectedTask && (
                  <div className="budget-availability">
                    Budget global :{" "}
                    <b>
                      {Number(selectedTask.budget_hours).toLocaleString(
                        "fr-FR",
                      )}{" "}
                      h
                    </b>{" "}
                    · Déjà alloué ailleurs :{" "}
                    <b>{allocatedToOtherZones.toLocaleString("fr-FR")} h</b>
                  </div>
                )}
                <label>
                  Heures allouées à {z.code}
                  <input
                    name="allocatedHours"
                    type="number"
                    min="0.25"
                    step="0.25"
                    required
                    defaultValue={editingAllocation?.allocated_hours ?? ""}
                  />
                </label>
                {error && <div className="settings-error">{error}</div>}
                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllocation(false);
                      setEditingAllocation(null);
                      setError("");
                    }}
                  >
                    Annuler
                  </button>
                  <button className="primary" disabled={saving}>
                    {saving ? "Enregistrement…" : "Enregistrer l’allocation"}
                  </button>
                </div>
              </form>
            </div>
          );
        })()}
    </div>
  );
}
