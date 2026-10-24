"use client";

import { useEffect, useState } from "react";
import type { PersonRow, AgencyRow, QualificationRow } from "@/app/shared";
import { Icon } from "@/app/ui/icons";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export function Teams({
  accessToken,
  toast,
}: {
  accessToken: string;
  toast: (s: string) => void;
}) {
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [agencyRows, setAgencyRows] = useState<AgencyRow[]>([]);
  const [qualificationRows, setQualificationRows] = useState<
    QualificationRow[]
  >([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contractType, setContractType] = useState<"interne" | "interimaire">(
    "interne",
  );
  async function load() {
    const db = createSupabaseBrowserClient();
    const project = (
      await db.from("projects").select("id").eq("code", "24-018").single()
    ).data;
    if (!project) return;
    const [{ data }, { data: loadedAgencies }, { data: loadedQualifications }] =
      await Promise.all([
        db
          .from("people")
          .select(
            "id,full_name,qualification,contract_type,coefficient,active,agency_id,agencies(name)",
          )
          .eq("project_id", project.id)
          .order("full_name"),
        db
          .from("agencies")
          .select(
            "id,name,code,address,postal_code,city,contact_name,phone,email,active",
          )
          .eq("project_id", project.id)
          .eq("active", true)
          .order("name"),
        db
          .from("qualifications")
          .select("id,name,active")
          .eq("project_id", project.id)
          .eq("active", true)
          .order("name"),
      ]);
    setRows((data ?? []) as unknown as PersonRow[]);
    setAgencyRows((loadedAgencies ?? []) as AgencyRow[]);
    setQualificationRows((loadedQualifications ?? []) as QualificationRow[]);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const visible = rows.filter((person) =>
    person.full_name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const response = await fetch("/api/operations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        kind: editing ? "person-update" : "person-create",
        personId: editing?.id,
        fullName: String(form.get("fullName") ?? ""),
        qualification: String(form.get("qualification") ?? ""),
        contractType: String(form.get("contractType") ?? "interne"),
        coefficient: String(form.get("coefficient") ?? ""),
        agencyId: String(form.get("agencyId") ?? ""),
      }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      toast(result.error ?? "Enregistrement impossible");
      return;
    }
    setEditing(null);
    setShowForm(false);
    toast("Collaborateur enregistré");
    void load();
  }
  async function toggleActive(person: PersonRow) {
    const response = await fetch("/api/operations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        kind: "person-active",
        personId: person.id,
        active: !person.active,
      }),
    });
    if (response.ok) {
      toast(
        person.active ? "Collaborateur désactivé" : "Collaborateur réactivé",
      );
      void load();
    } else toast("Modification impossible");
  }
  return (
    <div className="content page-content">
      <div className="page-head">
        <div>
          <h2>Équipes du chantier</h2>
          <p>
            Gérez les personnes qui seront proposées à l’affectation
            journalière.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditing(null);
            setContractType("interne");
            setShowForm(true);
          }}
        >
          <Icon name="plus" size={18} /> Ajouter une personne
        </button>
      </div>
      <div className="panel data-panel">
        <div className="filters">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="⌕ Rechercher une personne…"
          />
          <em>
            {visible.length} collaborateur{visible.length > 1 ? "s" : ""}
          </em>
        </div>
        <table>
          <thead>
            <tr>
              <th>COLLABORATEUR</th>
              <th>QUALIFICATION</th>
              <th>CONTRAT</th>
              <th>COEFFICIENT</th>
              <th>STATUT</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((person) => (
              <tr key={person.id}>
                <td>
                  <span className="avatar">
                    {person.full_name
                      .split(/\s+/)
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <b>{person.full_name}</b>
                </td>
                <td>{person.qualification ?? "—"}</td>
                <td>
                  {person.contract_type === "interimaire"
                    ? "Intérimaire"
                    : "Interne"}
                </td>
                <td>{person.coefficient ?? "—"}</td>
                <td>
                  <span
                    className={person.active ? "green-pill" : "status inactive"}
                  >
                    ● {person.active ? "Actif" : "Désactivé"}
                  </span>
                </td>
                <td>
                  <button
                    className="text-action"
                    onClick={() => {
                      setEditing(person);
                      setContractType(person.contract_type);
                      setShowForm(true);
                    }}
                  >
                    Modifier
                  </button>
                  <button
                    className="text-action"
                    onClick={() => void toggleActive(person)}
                  >
                    {person.active ? "Désactiver" : "Réactiver"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm && (
        <div className="modal-backdrop">
          <form className="task-modal" onSubmit={submit}>
            <div className="modal-title">
              <div>
                <span>
                  {editing
                    ? "MODIFIER LE COLLABORATEUR"
                    : "NOUVEAU COLLABORATEUR"}
                </span>
                <h3>{editing?.full_name ?? "Ajouter une personne"}</h3>
              </div>
              <button
                aria-label="Fermer"
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              >
                <Icon name="close" />
              </button>
            </div>
            <label>
              Nom complet
              <input
                name="fullName"
                required
                defaultValue={editing?.full_name ?? ""}
              />
            </label>
            <label>
              Qualification
              <select
                name="qualification"
                defaultValue={editing?.qualification ?? ""}
                required
              >
                <option value="" disabled>
                  Sélectionner une qualification
                </option>
                {qualificationRows.map((qualification) => (
                  <option key={qualification.id} value={qualification.name}>
                    {qualification.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Contrat
              <select
                name="contractType"
                value={contractType}
                onChange={(event) =>
                  setContractType(
                    event.target.value as "interne" | "interimaire",
                  )
                }
              >
                <option value="interne">Interne</option>
                <option value="interimaire">Intérimaire</option>
              </select>
            </label>
            {contractType === "interimaire" && (
              <label>
                Agence d’intérim
                <select
                  name="agencyId"
                  defaultValue={editing?.agency_id ?? ""}
                  required
                >
                  <option value="" disabled>
                    Sélectionner une agence existante
                  </option>
                  {agencyRows.map((agency) => (
                    <option key={agency.id} value={agency.id}>
                      {agency.code} · {agency.name}
                    </option>
                  ))}
                </select>
                {agencyRows.length === 0 && (
                  <small>
                    Créez d’abord une agence dans Intérim & feuilles.
                  </small>
                )}
              </label>
            )}
            <label>
              Coefficient
              <input
                name="coefficient"
                defaultValue={editing?.coefficient ?? ""}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
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
    </div>
  );
}
