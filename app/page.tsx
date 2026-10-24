"use client";

import { useEffect, useState } from "react";
import {
  type View,
  type CurrentProfile,
  type ProjectIdentity,
  roleLabel,
  canAccessView,
  loginEmail,
  loginLabel,
} from "@/app/shared";
import { Cables } from "@/app/views/cables";
import { Dashboard } from "@/app/views/dashboard";
import { ExtraWorksManager } from "@/app/views/extra-works";
import { Interim } from "@/app/views/interim";
import { MagasinManager } from "@/app/views/magasin";
import { MorningPresence } from "@/app/views/personnel";
import { Pointage } from "@/app/views/pointage";
import { Settings } from "@/app/views/settings";
import { StockManager } from "@/app/views/stock";
import { Tasks } from "@/app/views/tasks";
import { Teams } from "@/app/views/teams";
import { Zones } from "@/app/views/zones";
import { Icon, type IconName } from "@/app/ui/icons";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type NavItem = [View, IconName, string];

// Grouped by when people use them: the day's entries, the job's follow-up,
// then the teams and the store.
const navGroups: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: [["dashboard", "home", "Vue d’ensemble"]] },
  {
    title: "Journée",
    items: [
      ["presence", "check", "Présence du matin"],
      ["pointage", "clock", "Affectation des heures"],
    ],
  },
  {
    title: "Affaire",
    items: [
      ["taches", "list", "Tâches et budgets"],
      ["zones", "pin", "Zones et avancement"],
      ["travaux-supplementaires", "plus", "Travaux supplémentaires"],
      ["cables", "cable", "Carnet de câbles"],
    ],
  },
  {
    title: "Équipes et magasin",
    items: [
      ["equipes", "users", "Équipes"],
      ["interim", "file", "Intérim et feuilles"],
      ["stock", "box", "Stock"],
      ["engins", "truck", "Engins"],
      ["outillage", "wrench", "Électroportatif et outillage"],
      ["acces", "ladder", "Moyens d’accès"],
    ],
  },
];
const viewTitles = new Map<View, string>([
  ...navGroups.flatMap((group) =>
    group.items.map(([id, , label]) => [id, label] as [View, string]),
  ),
  ["settings", "Paramètres"],
]);

export default function Home() {
  const [accessToken, setAccessToken] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectIdentity[]>([]);
  const [notice, setNotice] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(
    null,
  );
  const [projectIdentity, setProjectIdentity] =
    useState<ProjectIdentity | null>(null);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? "");
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setAccessToken(session?.access_token ?? ""),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  async function loadShellData() {
    const db = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    const [profileResult, projectResult] = await Promise.all([
      user
        ? db
            .from("profiles")
            .select("id,full_name,role")
            .eq("id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // Row Level Security returns only the projects this account belongs to.
      db.from("projects").select("id,code,name,location").order("code"),
    ]);
    const memberProjects = (projectResult.data ?? []) as ProjectIdentity[];
    setUserEmail(user?.email ?? "");
    setCurrentProfile(profileResult.data as CurrentProfile | null);
    setProjects(memberProjects);
    setProjectIdentity(
      memberProjects.find((project) => project.code === "24-018") ?? null,
    );
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (accessToken) void loadShellData();
      else {
        setCurrentProfile(null);
        setProjectIdentity(null);
        setUserEmail("");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accessToken]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest("[data-account-menu]"))
        setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest("[data-project-menu]"))
        setProjectMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProjectMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [projectMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);

  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!username || !password) {
      setAuthError("Renseignez votre identifiant et votre mot de passe.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const result = await supabase.auth.signInWithPassword({
      email: loginEmail(username),
      password,
    });
    if (result.error) setAuthError("Identifiant ou mot de passe incorrect.");
  }

  async function signOut() {
    setAccountMenuOpen(false);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) toast("La déconnexion n’a pas pu être terminée.");
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const passwordConfirmation = String(form.get("passwordConfirmation") ?? "");

    if (newPassword.length < 8) {
      setAccountError(
        "Le nouveau mot de passe doit contenir au moins 8 caractères.",
      );
      return;
    }
    if (newPassword !== passwordConfirmation) {
      setAccountError(
        "La confirmation ne correspond pas au nouveau mot de passe.",
      );
      return;
    }
    if (currentPassword === newPassword) {
      setAccountError("Choisissez un mot de passe différent de l’actuel.");
      return;
    }

    setAccountSaving(true);
    const supabase = createSupabaseBrowserClient();
    const verification = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    });
    if (verification.error) {
      setAccountError("Le mot de passe actuel est incorrect.");
      setAccountSaving(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setAccountSaving(false);
    if (error) {
      setAccountError(error.message);
      return;
    }
    formElement.reset();
    setPasswordDialogOpen(false);
    toast("Mot de passe modifié avec succès.");
  }

  if (!authReady)
    return (
      <main className="auth-screen">
        <div className="auth-card">
          <b>PILOTIS</b>
          <p>Connexion sécurisée en cours…</p>
        </div>
      </main>
    );
  if (!accessToken)
    return (
      <main className="auth-screen">
        <form className="auth-card" onSubmit={authenticate}>
          <span className="brandmark">P</span>
          <h1>PILOTIS</h1>
          <p>Connectez-vous à votre espace chantier.</p>
          <label>
            Identifiant ou e-mail
            <input
              name="username"
              type="text"
              autoComplete="username"
              required
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
            />
          </label>
          <label>
            Mot de passe
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
            />
          </label>
          {authError && <div className="auth-error">{authError}</div>}
          <button className="primary" type="submit">
            Se connecter
          </button>
        </form>
      </main>
    );

  function toast(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 2800);
  }

  const workDate = selectedDate.toLocaleDateString("en-CA");
  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(selectedDate);
  function moveDate(days: number) {
    setSelectedDate(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth(),
          current.getDate() + days,
        ),
    );
  }

  const role = currentProfile?.role;
  const canSee = (target: View) => canAccessView(role, target);
  const activeView = canSee(view) ? view : "dashboard";
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(([id]) => canSee(id)),
    }))
    .filter((group) => group.items.length > 0);
  function openView(target: View) {
    if (canSee(target)) setView(target);
  }

  return (
    <main className="app-shell">
      {mobileMenuOpen ? (
        <button
          type="button"
          className="mobile-menu-backdrop"
          aria-label="Fermer le menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}
      <aside className={`sidebar${mobileMenuOpen ? " mobile-open" : ""}`}>
        <div className="brand">
          <span className="brandmark" aria-hidden="true">
            P
          </span>
          <b>Pilotis</b>
          <button
            type="button"
            className="sidebar-mobile-close"
            aria-label="Fermer le menu"
            onClick={() => setMobileMenuOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="project-picker" data-project-menu>
          <button
            type="button"
            className="project-switch"
            aria-haspopup="listbox"
            aria-expanded={projectMenuOpen}
            onClick={() => setProjectMenuOpen((open) => !open)}
          >
            <span>Affaire</span>
            <b>
              {projectIdentity
                ? `${projectIdentity.code} · ${projectIdentity.name}`
                : "Chargement de l’affaire…"}
            </b>
            <small>
              {projectIdentity?.location ?? "—"}
              <Icon name="chevronDown" size={16} />
            </small>
          </button>
          {projectMenuOpen && (
            <div className="project-menu">
              <ul role="listbox" aria-label="Affaires">
                {projects.map((project) => (
                  <li
                    role="option"
                    aria-selected={project.id === projectIdentity?.id}
                    key={project.id}
                  >
                    <b>
                      {project.code} · {project.name}
                    </b>
                    <small>{project.location ?? "—"}</small>
                    {project.id === projectIdentity?.id && (
                      <Icon name="check" size={16} />
                    )}
                  </li>
                ))}
              </ul>
              <p>
                {projects.length > 1
                  ? "Le changement d’affaire arrive avec le suivi multi-affaires."
                  : "Vous êtes rattaché à une seule affaire."}
              </p>
            </div>
          )}
        </div>
        <nav aria-label="Navigation principale">
          {visibleGroups.map((group) => (
            <div className="nav-group" key={group.title ?? "accueil"}>
              {group.title && (
                <span className="nav-section-label">{group.title}</span>
              )}
              {group.items.map(([id, icon, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-current={activeView === id ? "page" : undefined}
                  className={activeView === id ? "active" : ""}
                  onClick={() => {
                    openView(id);
                    setMobileMenuOpen(false);
                  }}
                >
                  <Icon name={icon} />
                  {label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {canSee("settings") && (
            <button
              type="button"
              onClick={() => {
                openView("settings");
                setMobileMenuOpen(false);
              }}
              aria-current={activeView === "settings" ? "page" : undefined}
              className={activeView === "settings" ? "active" : ""}
            >
              <Icon name="settings" /> Paramètres
            </button>
          )}
          <div className="user" data-account-menu>
            <span>
              {(currentProfile?.full_name ?? "Utilisateur")
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div>
              <b>{currentProfile?.full_name ?? authEmail}</b>
              <small>{roleLabel(currentProfile?.role)}</small>
            </div>
            <button
              className="account-menu-trigger"
              type="button"
              aria-label="Ouvrir le menu du compte"
              aria-expanded={accountMenuOpen}
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              <Icon name="more" />
            </button>
            {accountMenuOpen && (
              <div className="account-menu" role="menu">
                <div className="account-menu-profile">
                  <b>{currentProfile?.full_name ?? "Utilisateur"}</b>
                  <small>Identifiant : {loginLabel(userEmail)}</small>
                  <span>{roleLabel(currentProfile?.role)}</span>
                </div>
                {canSee("settings") && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      openView("settings");
                    }}
                  >
                    Paramètres du compte
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setAccountError("");
                    setPasswordDialogOpen(true);
                  }}
                >
                  Changer le mot de passe
                </button>
                <button
                  className="account-signout"
                  type="button"
                  role="menuitem"
                  onClick={signOut}
                >
                  Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header>
          <button
            type="button"
            className="mobile-menu"
            aria-label="Ouvrir le menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <Icon name="menu" size={22} />
          </button>
          <h1>
            {activeView === "dashboard"
              ? `Bonjour${currentProfile?.full_name ? ` ${currentProfile.full_name.split(/\s+/)[0]}` : ""}`
              : viewTitles.get(activeView)}
          </h1>
          <div className="header-actions">
            <div className="date-nav">
              <button
                type="button"
                aria-label="Jour précédent"
                onClick={() => moveDate(-1)}
              >
                <Icon name="chevronLeft" />
              </button>
              <input
                className="date-picker"
                type="date"
                aria-label="Date de travail"
                value={workDate}
                onChange={(event) => {
                  if (event.target.value)
                    setSelectedDate(new Date(`${event.target.value}T12:00:00`));
                }}
              />
              <button
                type="button"
                aria-label="Jour suivant"
                onClick={() => moveDate(1)}
              >
                <Icon name="chevronRight" />
              </button>
            </div>
            {canSee("pointage") && (
              <button
                type="button"
                className="btn btn-primary header-entry"
                aria-label="Saisir la journée"
                onClick={() => openView("pointage")}
              >
                <Icon name="plus" />
                <span>Saisir la journée</span>
              </button>
            )}
          </div>
        </header>

        {activeView === "dashboard" && (
          <Dashboard setView={openView} workDate={workDate} />
        )}
        {activeView === "presence" && (
          <MorningPresence
            workDate={workDate}
            dateLabel={dateLabel}
            toast={toast}
          />
        )}
        {activeView === "pointage" && (
          <Pointage
            accessToken={accessToken}
            workDate={workDate}
            dateLabel={dateLabel}
            toast={toast}
          />
        )}
        {activeView === "equipes" && (
          <Teams accessToken={accessToken} toast={toast} />
        )}
        {activeView === "interim" && (
          <Interim
            accessToken={accessToken}
            workDate={workDate}
            projectIdentity={projectIdentity}
            toast={toast}
          />
        )}
        {activeView === "taches" && (
          <Tasks accessToken={accessToken} toast={toast} />
        )}
        {activeView === "zones" && (
          <Zones accessToken={accessToken} toast={toast} />
        )}
        {activeView === "stock" && (
          <StockManager toast={toast} accessToken={accessToken} />
        )}
        {activeView === "engins" && (
          <MagasinManager
            section="engin"
            toast={toast}
            accessToken={accessToken}
          />
        )}
        {activeView === "outillage" && (
          <MagasinManager
            section="outillage"
            toast={toast}
            accessToken={accessToken}
          />
        )}
        {activeView === "acces" && (
          <MagasinManager
            section="acces"
            toast={toast}
            accessToken={accessToken}
          />
        )}
        {activeView === "travaux-supplementaires" && (
          <ExtraWorksManager toast={toast} accessToken={accessToken} />
        )}
        {activeView === "cables" && <Cables toast={toast} />}
        {activeView === "settings" && (
          <Settings
            accessToken={accessToken}
            currentProfile={currentProfile}
            onProjectUpdated={loadShellData}
            toast={toast}
          />
        )}
      </section>
      {passwordDialogOpen && (
        <div className="account-dialog-backdrop" role="presentation">
          <form className="account-dialog" onSubmit={changePassword}>
            <div className="account-dialog-head">
              <div>
                <small>SÉCURITÉ DU COMPTE</small>
                <h2>Changer le mot de passe</h2>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => {
                  setPasswordDialogOpen(false);
                  setAccountError("");
                }}
              >
                ×
              </button>
            </div>
            <p>
              Utilisez au moins 8 caractères. Une phrase de passe unique est
              recommandée.
            </p>
            <label>
              Mot de passe actuel
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              Nouveau mot de passe
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label>
              Confirmer le nouveau mot de passe
              <input
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            {accountError && <div className="auth-error">{accountError}</div>}
            <div className="account-dialog-actions">
              <button
                type="button"
                onClick={() => setPasswordDialogOpen(false)}
                disabled={accountSaving}
              >
                Annuler
              </button>
              <button
                className="primary"
                type="submit"
                disabled={accountSaving}
              >
                {accountSaving ? "Modification…" : "Modifier le mot de passe"}
              </button>
            </div>
          </form>
        </div>
      )}
      {notice && <div className="toast">✓ {notice}</div>}
    </main>
  );
}
