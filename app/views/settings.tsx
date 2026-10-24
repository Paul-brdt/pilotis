"use client";

import { useEffect, useState } from "react";
import {
  type CurrentProfile,
  accessLevels,
  type QualificationRow,
} from "@/app/shared";
import { WorkScheduleSettings } from "@/app/views/personnel";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type ProjectSettings = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  primary_color: string;
  logo_url: string | null;
  session_timeout_minutes: number;
};

type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
};

export function Settings({
  accessToken,
  currentProfile,
  onProjectUpdated,
  toast,
}: {
  accessToken: string;
  currentProfile: CurrentProfile | null;
  onProjectUpdated: () => Promise<void>;
  toast: (message: string) => void;
}) {
  const [tab, setTab] = useState<
    "chantier" | "application" | "horaires" | "qualifications" | "users"
  >("chantier");
  const [project, setProject] = useState<ProjectSettings | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [qualificationRows, setQualificationRows] = useState<
    QualificationRow[]
  >([]);
  const [editingQualification, setEditingQualification] =
    useState<QualificationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [error, setError] = useState("");
  const isAdministrator = currentProfile?.role === "administrateur";
  async function load() {
    setLoading(true);
    const db = createSupabaseBrowserClient();
    const [
      { data: projectData, error: projectError },
      { data: loadedQualifications },
    ] = await Promise.all([
      db
        .from("projects")
        .select(
          "id,code,name,location,contact_name,contact_email,contact_phone,primary_color,logo_url,session_timeout_minutes",
        )
        .eq("code", "24-018")
        .single(),
      db.from("qualifications").select("id,name,active").order("name"),
    ]);
    if (projectError) toast("Impossible de charger les paramètres");
    setProject(projectData as ProjectSettings | null);
    setQualificationRows((loadedQualifications ?? []) as QualificationRow[]);
    if (isAdministrator) {
      const response = await fetch("/api/admin/users", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const result = await response.json();
      if (response.ok) setManagedUsers(result.users as ManagedUser[]);
      else setError(result.error ?? "Impossible de charger les utilisateurs");
    } else {
      setManagedUsers([]);
      if (tab === "users") setTab("chantier");
    }
    setLoading(false);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [accessToken, isAdministrator]);
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
    return result;
  }
  async function saveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await send({
        kind: "project-settings",
        name: String(form.get("name") ?? ""),
        location: String(form.get("location") ?? ""),
        contactName: String(form.get("contactName") ?? ""),
        contactEmail: String(form.get("contactEmail") ?? ""),
        contactPhone: String(form.get("contactPhone") ?? ""),
        primaryColor: String(form.get("primaryColor") ?? "#27745d"),
        logoUrl: String(form.get("logoUrl") ?? ""),
        sessionTimeoutMinutes: Number(form.get("sessionTimeoutMinutes") ?? 30),
      });
      toast("Paramètres du chantier enregistrés");
      await load();
      await onProjectUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }
  async function saveApplication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await send({
        kind: "project-settings",
        name: project.name,
        location: project.location ?? "",
        contactName: project.contact_name ?? "",
        contactEmail: project.contact_email ?? "",
        contactPhone: project.contact_phone ?? "",
        primaryColor: project.primary_color || "#27745d",
        logoUrl: project.logo_url ?? "",
        sessionTimeoutMinutes: Number(form.get("sessionTimeoutMinutes") ?? 30),
      });
      toast("Paramètres de l’application enregistrés");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }
  async function saveUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          fullName: String(form.get("fullName") ?? ""),
          role: String(form.get("role") ?? "consultation"),
          projectId: project?.id,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Création de l’utilisateur impossible");
      toast("Utilisateur créé");
      setShowUser(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }
  async function createQualification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await send({
        kind: "qualification-create",
        name: String(form.get("name") ?? ""),
      });
      toast("Qualification ajoutée");
      event.currentTarget.reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }
  async function toggleQualification(qualification: QualificationRow) {
    setSaving(true);
    setError("");
    try {
      await send({
        kind: "qualification-active",
        qualificationId: qualification.id,
        active: !qualification.active,
      });
      toast(
        qualification.active
          ? "Qualification désactivée"
          : "Qualification réactivée",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }
  async function updateQualification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingQualification) return;
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await send({
        kind: "qualification-update",
        qualificationId: editingQualification.id,
        name: String(form.get("name") ?? ""),
      });
      toast("Qualification modifiée");
      setEditingQualification(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }
  async function deleteQualification(qualification: QualificationRow) {
    if (
      !window.confirm(
        `Supprimer définitivement la qualification « ${qualification.name} » ?`,
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      await send({
        kind: "qualification-delete",
        qualificationId: qualification.id,
      });
      toast("Qualification supprimée");
      if (editingQualification?.id === qualification.id)
        setEditingQualification(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }
  async function deleteUser(user: ManagedUser) {
    if (
      !window.confirm(
        `Supprimer définitivement le compte de ${user.full_name || user.email} ?`,
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/users?userId=${encodeURIComponent(user.id)}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${accessToken}` },
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Suppression impossible");
      toast("Utilisateur supprimé");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }
  async function updateUserRole(user: ManagedUser, role: string) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId: user.id, role }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Modification impossible");
      toast("Niveau d’accès mis à jour");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <div className="content page-content">
        <div className="panel empty-state">Chargement des paramètres…</div>
      </div>
    );
  if (!project)
    return (
      <div className="content page-content">
        <div className="panel empty-state">
          Les paramètres du chantier sont indisponibles.
        </div>
      </div>
    );
  return (
    <div className="content page-content settings-page">
      <div className="page-head">
        <div>
          <h2>Paramètres</h2>
          <p>
            Configurez l’identité du chantier, les utilisateurs et les options
            de fonctionnement.
          </p>
        </div>
        <span className="status">● Enregistré dans le chantier</span>
      </div>
      <div className="settings-tabs">
        <button
          className={tab === "chantier" ? "active" : ""}
          onClick={() => setTab("chantier")}
        >
          Chantier & identité
        </button>
        <button
          className={tab === "application" ? "active" : ""}
          onClick={() => setTab("application")}
        >
          Application
        </button>
        <button
          className={tab === "horaires" ? "active" : ""}
          onClick={() => setTab("horaires")}
        >
          Horaires
        </button>
        <button
          className={tab === "qualifications" ? "active" : ""}
          onClick={() => setTab("qualifications")}
        >
          Qualifications
        </button>
        {isAdministrator && (
          <button
            className={tab === "users" ? "active" : ""}
            onClick={() => setTab("users")}
          >
            Utilisateurs
          </button>
        )}
      </div>
      {tab === "chantier" && (
        <form className="panel settings-form" onSubmit={saveProject}>
          <div className="panel-title">
            <div>
              <span>IDENTITÉ DU CHANTIER</span>
              <h3>Informations affichées dans PILOTIS et les exports</h3>
            </div>
          </div>
          <div className="settings-grid">
            <label>
              Code chantier
              <input name="code" value={project.code} disabled />
            </label>
            <label>
              Nom du chantier
              <input name="name" defaultValue={project.name} required />
            </label>
            <label>
              Localisation
              <input
                name="location"
                defaultValue={project.location ?? ""}
                placeholder="Ville, site ou adresse"
              />
            </label>
            <label>
              Couleur principale
              <input
                name="primaryColor"
                type="color"
                defaultValue={project.primary_color || "#27745d"}
              />
            </label>
            <label>
              Contact chantier
              <input
                name="contactName"
                defaultValue={project.contact_name ?? ""}
                placeholder="Nom et fonction"
              />
            </label>
            <label>
              Téléphone
              <input
                name="contactPhone"
                type="tel"
                defaultValue={project.contact_phone ?? ""}
              />
            </label>
            <label>
              E-mail
              <input
                name="contactEmail"
                type="email"
                defaultValue={project.contact_email ?? ""}
              />
            </label>
            <label>
              URL du logo
              <input
                name="logoUrl"
                type="url"
                defaultValue={project.logo_url ?? ""}
                placeholder="https://…"
              />
            </label>
          </div>
          {project.logo_url && (
            <div className="logo-preview">
              <img src={project.logo_url} alt="Logo du chantier" />
              <span>Logo actuellement utilisé</span>
            </div>
          )}{" "}
          {error && <div className="settings-error">{error}</div>}
          <div className="settings-actions">
            <button className="primary" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer les paramètres"}
            </button>
          </div>
        </form>
      )}
      {tab === "application" && (
        <form className="panel settings-form" onSubmit={saveApplication}>
          <div className="panel-title">
            <div>
              <span>FONCTIONNEMENT</span>
              <h3>Réglages généraux de l’application</h3>
            </div>
          </div>
          <div className="settings-grid">
            <label>
              Langue
              <input value="Français" disabled />
            </label>
            <label>
              Fuseau horaire
              <input value="Indian/Reunion (UTC+04:00)" disabled />
            </label>
            <label>
              Déconnexion après inactivité
              <select
                name="sessionTimeoutMinutes"
                defaultValue={String(project.session_timeout_minutes ?? 30)}
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">60 minutes</option>
              </select>
            </label>
            <label>
              Connexion Internet
              <input value="Obligatoire" disabled />
            </label>
          </div>
          <p className="settings-help">
            Les réglages de sécurité et les autorisations sont réservés aux
            administrateurs. Toute modification est tracée dans le journal
            d’audit.
          </p>
          {error && <div className="settings-error">{error}</div>}
          <div className="settings-actions">
            <button className="primary" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      )}
      {tab === "horaires" && <WorkScheduleSettings toast={toast} />}
      {tab === "qualifications" && (
        <div>
          <form
            className="panel settings-form"
            onSubmit={
              editingQualification ? updateQualification : createQualification
            }
          >
            <div className="panel-title">
              <div>
                <span>RÉFÉRENTIEL ÉQUIPES</span>
                <h3>Qualifications proposées dans les fiches personnes</h3>
              </div>
            </div>
            <div className="settings-grid">
              <label>
                {editingQualification
                  ? "Modifier la qualification"
                  : "Nouvelle qualification"}
                <input
                  key={editingQualification?.id ?? "new"}
                  name="name"
                  required
                  defaultValue={editingQualification?.name ?? ""}
                  placeholder="Ex. Électricien N3P2"
                />
              </label>
            </div>
            <div className="settings-actions">
              {editingQualification && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditingQualification(null)}
                >
                  Annuler
                </button>
              )}
              <button className="primary" disabled={saving}>
                {saving
                  ? "Enregistrement…"
                  : editingQualification
                    ? "Enregistrer la modification"
                    : "Ajouter la qualification"}
              </button>
            </div>
          </form>
          {error && <div className="settings-error">{error}</div>}
          <div className="panel user-management-list">
            {qualificationRows.map((qualification) => (
              <div className="user-management-row" key={qualification.id}>
                <div>
                  <b>{qualification.name}</b>
                  <small>
                    {qualification.active
                      ? "Disponible dans les listes"
                      : "Désactivée"}
                  </small>
                </div>
                <span
                  className={
                    qualification.active ? "green-pill" : "status inactive"
                  }
                >
                  ● {qualification.active ? "Active" : "Inactive"}
                </span>
                <button
                  className="text-action"
                  disabled={saving}
                  onClick={() => setEditingQualification(qualification)}
                >
                  Modifier
                </button>
                <button
                  className="text-action"
                  disabled={saving}
                  onClick={() => void toggleQualification(qualification)}
                >
                  {qualification.active ? "Désactiver" : "Réactiver"}
                </button>
                <button
                  className="text-action danger"
                  disabled={saving}
                  onClick={() => void deleteQualification(qualification)}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === "users" && isAdministrator && (
        <div>
          <div className="settings-section-head">
            <div>
              <b>{managedUsers.length} utilisateurs</b>
              <small>
                Comptes autorisés à se connecter et niveau d’accès associé.
              </small>
            </div>
            <button className="primary" onClick={() => setShowUser(true)}>
              ＋ Nouvel utilisateur
            </button>
          </div>
          {error && <div className="settings-error">{error}</div>}
          <div className="panel user-management-list">
            {managedUsers.map((user) => (
              <div className="user-management-row" key={user.id}>
                <div>
                  <b>{user.full_name || "Utilisateur sans nom"}</b>
                  <small>{user.email}</small>
                </div>
                <select
                  aria-label={`Niveau d’accès de ${user.full_name || user.email}`}
                  value={user.role}
                  disabled={saving}
                  onChange={(event) =>
                    void updateUserRole(user, event.target.value)
                  }
                >
                  {accessLevels.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <small>
                  {user.last_sign_in_at
                    ? `Dernière connexion ${new Date(user.last_sign_in_at).toLocaleDateString("fr-FR")}`
                    : "Jamais connecté"}
                </small>
                <button
                  className="danger-button"
                  disabled={saving || user.id === currentProfile?.id}
                  title={
                    user.id === currentProfile?.id
                      ? "Vous ne pouvez pas supprimer votre propre compte"
                      : "Supprimer ce compte"
                  }
                  onClick={() => void deleteUser(user)}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {showUser && isAdministrator && (
        <div className="modal-backdrop">
          <form className="task-modal" onSubmit={saveUser}>
            <div className="modal-title">
              <div>
                <span>NOUVEL UTILISATEUR</span>
                <h3>Créer un accès à PILOTIS</h3>
              </div>
              <button type="button" onClick={() => setShowUser(false)}>
                ×
              </button>
            </div>
            <label>
              Nom complet
              <input name="fullName" required placeholder="Prénom et nom" />
            </label>
            <label>
              Adresse e-mail
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              Mot de passe temporaire
              <input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              Niveau d’accès
              <select name="role" defaultValue="consultation">
                {accessLevels.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {error && <div className="settings-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" onClick={() => setShowUser(false)}>
                Annuler
              </button>
              <button className="primary" disabled={saving}>
                {saving ? "Création…" : "Créer l’utilisateur"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
