"use client";

import { useEffect, useState } from "react";
import type { ProjectIdentity, PersonRow, AgencyRow } from "@/app/shared";
import { Kpi } from "@/app/ui/kpi";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { isoWeekNumber, type TimesheetSnapshot } from "@/lib/timesheet";

export function Interim({ accessToken, workDate, projectIdentity, toast }: { accessToken: string; workDate: string; projectIdentity: ProjectIdentity | null; toast: (s: string) => void }) {
  type InterimPerson = PersonRow & { agency_id: string };
  type WeekAttendance = { person_id: string; work_date: string; status: string; regular_hours: number | string; automatic_overtime_hours: number | string; manual_overtime_hours: number | string | null };
  type GeneratedSheet = { agency_id: string; week_start: string; status: string; generated_at: string; snapshot: TimesheetSnapshot | null };
  const [tab, setTab] = useState<"feuilles" | "agences">("feuilles");
  const [agencyRows, setAgencyRows] = useState<AgencyRow[]>([]);
  const [interimPeople, setInterimPeople] = useState<InterimPerson[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<WeekAttendance[]>([]);
  const [generatedSheets, setGeneratedSheets] = useState<GeneratedSheet[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState("");
  const [editingAgency, setEditingAgency] = useState<AgencyRow | null>(null);
  const [showAgency, setShowAgency] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = new Date(`${workDate}T12:00:00`);
  const day = selected.getDay() || 7;
  const workMonday = new Date(selected); workMonday.setDate(selected.getDate() - day + 1);
  const currentWeekStart = workMonday.toLocaleDateString("en-CA");
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const monday = new Date(`${weekStart}T12:00:00`);
  const weekDays = Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setDate(monday.getDate() + index); return date; });
  const weekEnd = weekDays[6].toLocaleDateString("en-CA");
  const weekNumber = isoWeekNumber(monday);

  async function load() {
    const db = createSupabaseBrowserClient();
    const project = (await db.from("projects").select("id").eq("code", "24-018").single()).data;
    if (!project) return;
    const [{ data: loadedAgencies }, { data: loadedPeople }, { data: loadedEntries }, { data: loadedSheets }] = await Promise.all([
      db.from("agencies").select("id,name,code,address,postal_code,city,contact_name,phone,email,active").eq("project_id", project.id).order("name"),
      db.from("people").select("id,full_name,qualification,contract_type,coefficient,active,agency_id,agencies(name)").eq("project_id", project.id).eq("contract_type", "interimaire").eq("active", true).order("full_name"),
      db.from("daily_attendance").select("person_id,work_date,status,regular_hours,automatic_overtime_hours,manual_overtime_hours").eq("project_id", project.id).gte("work_date", weekStart).lte("work_date", weekEnd),
      db.from("weekly_timesheets").select("agency_id,week_start,status,generated_at,snapshot").eq("project_id", project.id).order("week_start", { ascending: false }),
    ]);
    const loaded = (loadedAgencies ?? []) as AgencyRow[];
    setAgencyRows(loaded); setInterimPeople((loadedPeople ?? []) as unknown as InterimPerson[]); setAttendanceRows((loadedEntries ?? []) as WeekAttendance[]); setGeneratedSheets((loadedSheets ?? []) as GeneratedSheet[]);
    setSelectedAgencyId((current) => loaded.some((item) => item.id === current) ? current : loaded.find((item) => item.active)?.id ?? loaded[0]?.id ?? "");
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [weekStart]);
  const selectedAgency = agencyRows.find((item) => item.id === selectedAgencyId) ?? null;
  const peopleForAgency = interimPeople.filter((person) => person.agency_id === selectedAgencyId);
  const currentSheet = generatedSheets.find((sheet) => sheet.agency_id === selectedAgencyId && sheet.week_start === weekStart);
  const attendanceHours = (row: WeekAttendance) => row.status === "present" ? Number(row.regular_hours) + Number(row.manual_overtime_hours ?? row.automatic_overtime_hours) : 0;
  const sheets = peopleForAgency.map((person) => {
    const hours = weekDays.map((date) => attendanceRows.filter((row) => row.person_id === person.id && row.work_date === date.toLocaleDateString("en-CA")).reduce((sum, row) => sum + attendanceHours(row), 0));
    return { person, hours, total: hours.reduce((sum, value) => sum + value, 0), meals: hours.filter((value) => value > 5).length };
  });
  const today = new Date().toLocaleDateString("en-CA");
  const isOpenWeek = weekStart <= today && weekEnd >= today;
  const displayedSheets = !isOpenWeek && currentSheet?.snapshot?.workers ? currentSheet.snapshot.workers.map((worker) => ({
    person: { id: worker.id, full_name: worker.name, qualification: worker.qualification, coefficient: worker.coefficient },
    hours: worker.hours, total: worker.total, meals: worker.meals,
  })) : sheets;
  const displayedDays = !isOpenWeek && currentSheet?.snapshot?.days ? currentSheet.snapshot.days : weekDays.map((date) => ({ date: date.toLocaleDateString("en-CA"), label: date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit" }).toUpperCase() }));
  const agencyHistory = generatedSheets.filter((sheet) => sheet.agency_id === selectedAgencyId);
  const agencyTotals = new Map(agencyRows.map((agency) => { const workers = interimPeople.filter((person) => person.agency_id === agency.id); const total = attendanceRows.filter((row) => workers.some((person) => person.id === row.person_id)).reduce((sum, row) => sum + attendanceHours(row), 0); return [agency.id, total]; }));
  const totalHours = attendanceRows.filter((row) => interimPeople.some((person) => person.id === row.person_id)).reduce((sum, row) => sum + attendanceHours(row), 0);
  const totalMeals = interimPeople.reduce((sum, person) => sum + weekDays.filter((date) => attendanceRows.filter((row) => row.person_id === person.id && row.work_date === date.toLocaleDateString("en-CA")).reduce((dayTotal, row) => dayTotal + attendanceHours(row), 0) > 5).length, 0);
  async function send(body: Record<string, unknown>) { const response = await fetch("/api/operations", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Enregistrement impossible"); }
  async function saveAgency(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget); try { await send({ kind: editingAgency ? "agency-update" : "agency-create", agencyId: editingAgency?.id, name: form.get("name"), code: form.get("code"), address: form.get("address"), postalCode: form.get("postalCode"), city: form.get("city"), contactName: form.get("contactName"), phone: form.get("phone"), email: form.get("email"), active: form.get("active") === "on" }); toast(editingAgency ? "Agence mise à jour" : "Agence créée"); setShowAgency(false); setEditingAgency(null); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); } finally { setSaving(false); } }
  async function generate(agencyId: string) { setSaving(true); setError(""); try { await send({ kind: "timesheet-generate", agencyId, weekStart }); toast(`Feuille de la semaine ${weekNumber} générée`); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); } finally { setSaving(false); } }
  async function validateSheet() { if (!selectedAgencyId) return; setSaving(true); setError(""); try { await send({ kind: "timesheet-status", agencyId: selectedAgencyId, weekStart }); toast("Validation de la feuille enregistrée"); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); } finally { setSaving(false); } }
  async function downloadPdf() {
    if (!selectedAgencyId || !currentSheet) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/timesheets/pdf?agencyId=${encodeURIComponent(selectedAgencyId)}&weekStart=${encodeURIComponent(weekStart)}`, { headers: { authorization: `Bearer ${accessToken}` } });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? "PDF indisponible"); }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = href;
      link.download = `feuille-pointage-${selectedAgency?.code ?? "agence"}-S${weekNumber}.pdf`; link.click(); URL.revokeObjectURL(href);
      toast(`PDF de la semaine ${weekNumber} téléchargé`);
    } catch (e) { setError(e instanceof Error ? e.message : "PDF indisponible"); } finally { setSaving(false); }
  }
  const sheetStatusLabel = currentSheet?.status === "bureau_validated" ? "Validée par le bureau" : currentSheet?.status === "conducteur_validated" ? "Validée par le conducteur" : currentSheet ? "Générée" : "À générer";
  return (
    <div className="content page-content">
      <div className="page-head">
        <div>
          <h2>Intérim & feuilles de pointage</h2>
          <p>
            Préparez les relevés hebdomadaires et gérez les coordonnées des
            agences.
          </p>
        </div>
        <button
          className="primary"
          disabled={saving || !selectedAgencyId}
          onClick={() => void generate(selectedAgencyId)}
        >
          ▤ Générer la feuille · S{weekNumber}
        </button>
      </div>
      <div className="interim-tabs">
        <button
          className={tab === "feuilles" ? "active" : ""}
          onClick={() => setTab("feuilles")}
        >
          Feuilles hebdomadaires
        </button>
        <button
          className={tab === "agences" ? "active" : ""}
          onClick={() => setTab("agences")}
        >
          Agences d’intérim
        </button>
      </div>
      {tab === "feuilles" ? (
        <>
          <div className="interim-kpis">
            <Kpi
              label="SEMAINE"
              value={String(weekNumber)}
              detail={`du ${weekDays[0].toLocaleDateString("fr-FR")} au ${weekDays[6].toLocaleDateString("fr-FR")}`}
              tone="green"
            />
            <Kpi
              label="INTÉRIMAIRES"
              value={String(interimPeople.length)}
              detail={`répartis dans ${new Set(interimPeople.map((person) => person.agency_id)).size} agences`}
              tone="blue"
            />
            <Kpi
              label="HEURES À VALIDER"
              value={`${totalHours.toLocaleString("fr-FR")} h`}
              detail="calculées depuis les pointages réels"
              tone="gold"
            />
            <Kpi
              label="PANIERS"
              value={String(totalMeals)}
              detail="journées travaillées > 5 h"
              tone="purple"
            />
          </div>
          <div className="panel timesheet-history-bar">
            <div><span>HISTORIQUE PAR AGENCE</span><b>Consulter une feuille générée</b></div>
            <label>Agence
              <select value={selectedAgencyId} onChange={(event) => { setSelectedAgencyId(event.target.value); setWeekStart(currentWeekStart); }}>
                {agencyRows.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
              </select>
            </label>
            <label>Numéro de semaine
              <select value={weekStart} onChange={(event) => setWeekStart(event.target.value)}>
                {!agencyHistory.some((sheet) => sheet.week_start === currentWeekStart) && <option value={currentWeekStart}>S{isoWeekNumber(new Date(`${currentWeekStart}T12:00:00`))} · semaine en cours</option>}
                {agencyHistory.map((sheet) => <option key={sheet.week_start} value={sheet.week_start}>S{sheet.snapshot?.weekNumber ?? isoWeekNumber(new Date(`${sheet.week_start}T12:00:00`))} · {new Date(`${sheet.week_start}T12:00:00`).toLocaleDateString("fr-FR")} · {sheet.status === "bureau_validated" ? "Validée bureau" : sheet.status === "conducteur_validated" ? "Validée conducteur" : "Générée"}</option>)}
              </select>
            </label>
            <button disabled={!currentSheet || saving} onClick={() => void downloadPdf()}>Télécharger le PDF</button>
          </div>
          <div className="sheet-layout">
            <div className="panel agency-selector">
              <div className="panel-title">
                <div>
                  <span>AGENCES ACTIVES</span>
                  <h3>Feuilles à générer</h3>
                </div>
              </div>
              {agencyRows.filter((item) => item.active).map((a) => (
                <button
                  key={a.id}
                  className={selectedAgencyId === a.id ? "selected" : ""}
                  onClick={() => setSelectedAgencyId(a.id)}
                >
                  <i>{a.name.slice(0, 1)}</i>
                  <div>
                    <b>{a.name}</b>
                    <small>
                      {interimPeople.filter((person) => person.agency_id === a.id).length} intérimaire(s) · Semaine {weekNumber}
                    </small>
                  </div>
                  <em>{(agencyTotals.get(a.id) ?? 0).toLocaleString("fr-FR")} h</em>
                </button>
              ))}
            </div>
            <div className="panel weekly-sheet">
              <div className="sheet-header">
                <div>
                  <span>FEUILLE DE POINTAGE · SEMAINE {weekNumber}</span>
                  <h3>{selectedAgency?.name ?? "Aucune agence"}</h3>
                  <small>
                    {[selectedAgency?.address, selectedAgency?.postal_code, selectedAgency?.city].filter(Boolean).join(" · ") || "Coordonnées non renseignées"}
                  </small>
                </div>
                <div>
                  <b>Chantier 24-018</b>
                  <small>{projectIdentity?.name ?? "Chantier actif"}</small>
                </div>
              </div>
              <div className="sheet-table">
                <table>
                  <thead>
                    <tr>
                      <th>INTÉRIMAIRE</th>
                      {displayedDays.map((date) => <th key={date.date}>{date.label}</th>)}
                      <th>TOTAL</th>
                      <th>PANIERS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSheets.map((s) => (
                      <tr key={s.person.id}>
                        <td>
                          <b>{s.person.full_name}</b>
                          <small>{s.person.qualification} · Coefficient {s.person.coefficient ?? "—"}</small>
                        </td>
                        {s.hours.map((h, i) => (
                          <td key={i}>
                            <span className={h > 5 ? "worked" : ""}>
                              {h ? h : "—"}
                            </span>
                          </td>
                        ))}
                        <td>
                          <strong>{s.total} h</strong>
                        </td>
                        <td>
                          <strong>◉ {s.meals}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>TOTAL AGENCE</td>
                      <td colSpan={7}>
                        Heures · Paniers si journée &gt; 5 h
                      </td>
                      <td>{displayedSheets.reduce((sum, sheet) => sum + sheet.total, 0).toLocaleString("fr-FR")} h</td>
                      <td>{displayedSheets.reduce((sum, sheet) => sum + sheet.meals, 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="sheet-footer">
                <span>
                  Statut :{" "}
                  <b className={currentSheet ? "validated" : "draft"}>
                    ● {sheetStatusLabel}
                  </b>
                </span>
                <div>
                  <button disabled={!currentSheet || saving} onClick={() => void downloadPdf()}>
                    Télécharger le PDF
                  </button>
                  <button
                    className="primary"
                    disabled={saving || !selectedAgencyId}
                    onClick={() => void generate(selectedAgencyId)}
                  >
                    Générer cette feuille
                  </button>
                  {currentSheet && currentSheet.status !== "bureau_validated" && <button className="primary" disabled={saving} onClick={() => void validateSheet()}>{currentSheet.status === "generated" ? "Valider conducteur" : "Valider bureau"}</button>}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="agencies-view">
          <div className="agencies-head">
            <div>
              <b>{agencyRows.length} agences enregistrées</b>
              <span>
                Coordonnées utilisées automatiquement sur les feuilles de
                pointage
              </span>
            </div>
            <button
              className="primary"
              onClick={() => { setEditingAgency(null); setShowAgency(true); }}
            >
              ＋ Créer une agence
            </button>
          </div>
          <div className="agency-cards">
            {agencyRows.map((a) => {
              const workers = interimPeople.filter((person) => person.agency_id === a.id).length;
              return <div className="panel agency-card" key={a.id}>
                <div className="agency-card-top">
                  <i>{a.name.slice(0, 1)}</i>
                  <div>
                    <small>{a.code}</small>
                    <h3>{a.name}</h3>
                  </div>
                  <button>•••</button>
                </div>
                <div className="agency-address">
                  <span>⌖</span>
                  <div>
                    {a.address}
                    <br />
                    {[a.postal_code, a.city].filter(Boolean).join(" ")}
                  </div>
                </div>
                <div className="agency-contact">
                  <span>
                    <small>CONTACT</small>
                    <b>{a.contact_name ?? "—"}</b>
                  </span>
                  <span>
                    <small>TÉLÉPHONE</small>
                    <b>{a.phone ?? "—"}</b>
                  </span>
                  <span>
                    <small>E-MAIL</small>
                    <b>{a.email ?? "—"}</b>
                  </span>
                </div>
                <div className="agency-card-foot">
                  <span>
                    <b>{workers}</b> intérimaire{workers > 1 ? "s" : ""} affecté{workers > 1 ? "s" : ""}
                  </span>
                  <button onClick={() => { setEditingAgency(a); setShowAgency(true); }}>Modifier →</button>
                </div>
              </div>;
            })}
          </div>
        </div>
      )}
      {error && <div className="settings-error">{error}</div>}
      {showAgency && <div className="modal-backdrop"><form className="task-modal" onSubmit={saveAgency}>
        <div className="modal-title"><div><span>{editingAgency ? "MODIFIER L’AGENCE" : "NOUVELLE AGENCE"}</span><h3>{editingAgency?.name ?? "Créer une agence"}</h3></div><button type="button" onClick={() => setShowAgency(false)}>×</button></div>
        <label>Nom<input name="name" required defaultValue={editingAgency?.name ?? ""} /></label>
        <label>Code<input name="code" required defaultValue={editingAgency?.code ?? ""} /></label>
        <label>Adresse<input name="address" defaultValue={editingAgency?.address ?? ""} /></label>
        <div className="form-grid"><label>Code postal<input name="postalCode" defaultValue={editingAgency?.postal_code ?? ""} /></label><label>Ville<input name="city" defaultValue={editingAgency?.city ?? ""} /></label></div>
        <label>Contact<input name="contactName" defaultValue={editingAgency?.contact_name ?? ""} /></label>
        <div className="form-grid"><label>Téléphone<input name="phone" defaultValue={editingAgency?.phone ?? ""} /></label><label>E-mail<input name="email" type="email" defaultValue={editingAgency?.email ?? ""} /></label></div>
        <label className="checkbox-line"><input name="active" type="checkbox" defaultChecked={editingAgency?.active ?? true} /> Agence active</label>
        <div className="modal-actions"><button type="button" onClick={() => setShowAgency(false)}>Annuler</button><button className="primary" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button></div>
      </form></div>}
    </div>
  );
}
