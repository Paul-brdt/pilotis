"use client";

import { useEffect, useState } from "react";
import {
  type View,
  type CurrentProfile,
  type ProjectIdentity,
  roleLabel,
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
import { createSupabaseBrowserClient } from "@/lib/supabase";

const personnelNav = [
  ["presence", "✓", "Présence du matin"],
  ["pointage", "◷", "Affectation journalière"],
  ["equipes", "♙", "Équipes"],
  ["interim", "▣", "Intérim & feuilles"],
] as [View, string, string][];

const magasinNav = [
  ["stock", "▦", "Suivi de stock"],
  ["engins", "♜", "Engins"],
  ["outillage", "⌘", "Électroportatif / Outillage"],
  ["acces", "⌑", "Moyens d’accès"],
] as [View, string, string][];

const nav = [
  ["dashboard", "⌂", "Vue d’ensemble"],
  ["taches", "▤", "Tâches & budgets"],
  ["zones", "⌖", "Zones de travail"],
  ["cables", "⌁", "Carnet de câbles"],
  ["travaux-supplementaires", "＋", "Travaux supplémentaires"],
] as [View, string, string][];

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
  const [openNavSections, setOpenNavSections] = useState({
    personnel: false,
    magasin: false,
    chantier: false,
  });
  const [notice, setNotice] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(
    null,
  );
  const [projectIdentity, setProjectIdentity] =
    useState<ProjectIdentity | null>(null);

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
      db
        .from("projects")
        .select("id,code,name,location")
        .eq("code", "24-018")
        .single(),
    ]);
    setCurrentProfile(profileResult.data as CurrentProfile | null);
    setProjectIdentity(projectResult.data as ProjectIdentity | null);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (accessToken) void loadShellData();
      else {
        setCurrentProfile(null);
        setProjectIdentity(null);
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

    if (username.toLowerCase() !== "admin") {
      setAuthError("Identifiant ou mot de passe incorrect.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const result = await supabase.auth.signInWithPassword({
      email: "admin@pilotis.internal",
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
      email: "admin@pilotis.internal",
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
            Identifiant
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
          <span className="brandmark">P</span>
          <div>
            <b>PILOTIS</b>
            <small>CHANTIER ÉLECTRIQUE</small>
          </div>
          <button
            type="button"
            className="sidebar-mobile-close"
            aria-label="Fermer le menu"
            onClick={() => setMobileMenuOpen(false)}
          >
            ×
          </button>
        </div>
        <div className="project-switch">
          <span>CHANTIER ACTIF</span>
          <b>{projectIdentity?.name ?? "Chargement du chantier…"}</b>
          <small>
            {[projectIdentity?.location, projectIdentity?.code]
              .filter(Boolean)
              .join(" · ") || "—"}{" "}
            ↕
          </small>
        </div>
        <nav>
          {nav.slice(0, 1).map(([id, icon, label]) => (
            <button
              key={id}
              onClick={() => {
                setView(id);
                setMobileMenuOpen(false);
              }}
              className={view === id ? "active" : ""}
            >
              <i>{icon}</i>
              {label}
            </button>
          ))}
          <button
            type="button"
            className="nav-section-toggle"
            aria-expanded={openNavSections.personnel}
            onClick={() =>
              setOpenNavSections((current) => ({
                ...current,
                personnel: !current.personnel,
              }))
            }
          >
            <span>PERSONNEL</span>
            <i>{openNavSections.personnel ? "⌃" : "⌄"}</i>
          </button>
          {openNavSections.personnel &&
            personnelNav.map(([id, icon, label]) => (
              <button
                key={id}
                onClick={() => {
                  setView(id);
                  setMobileMenuOpen(false);
                }}
                className={view === id ? "active" : ""}
              >
                <i>{icon}</i>
                {label}
              </button>
            ))}
          <button
            type="button"
            className="nav-section-toggle"
            aria-expanded={openNavSections.magasin}
            onClick={() =>
              setOpenNavSections((current) => ({
                ...current,
                magasin: !current.magasin,
              }))
            }
          >
            <span>MAGASIN</span>
            <i>{openNavSections.magasin ? "⌃" : "⌄"}</i>
          </button>
          {openNavSections.magasin &&
            magasinNav.map(([id, icon, label]) => (
              <button
                key={id}
                onClick={() => {
                  setView(id);
                  setMobileMenuOpen(false);
                }}
                className={view === id ? "active" : ""}
              >
                <i>{icon}</i>
                {label}
              </button>
            ))}
          <button
            type="button"
            className="nav-section-toggle"
            aria-expanded={openNavSections.chantier}
            onClick={() =>
              setOpenNavSections((current) => ({
                ...current,
                chantier: !current.chantier,
              }))
            }
          >
            <span>CHANTIER</span>
            <i>{openNavSections.chantier ? "⌃" : "⌄"}</i>
          </button>
          {openNavSections.chantier &&
            nav.slice(1).map(([id, icon, label]) => (
              <button
                key={id}
                onClick={() => {
                  setView(id);
                  setMobileMenuOpen(false);
                }}
                className={view === id ? "active" : ""}
              >
                <i>{icon}</i>
                {label}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            onClick={() => {
              setView("settings");
              setMobileMenuOpen(false);
            }}
            className={view === "settings" ? "active" : ""}
          >
            <i>⚙</i> Paramètres
          </button>
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
              ⋮
            </button>
            {accountMenuOpen && (
              <div className="account-menu" role="menu">
                <div className="account-menu-profile">
                  <b>{currentProfile?.full_name ?? "Utilisateur"}</b>
                  <small>Identifiant : admin</small>
                  <span>{roleLabel(currentProfile?.role)}</span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setView("settings");
                  }}
                >
                  <i>⚙</i> Paramètres du compte
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setAccountError("");
                    setPasswordDialogOpen(true);
                  }}
                >
                  <i>⌘</i> Changer le mot de passe
                </button>
                <button
                  className="account-signout"
                  type="button"
                  role="menuitem"
                  onClick={signOut}
                >
                  <i>↪</i> Se déconnecter
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
            ☰
          </button>
          <div>
            <span className="crumb">
              CHANTIERS / {projectIdentity?.code ?? "…"}
            </span>
            <h1>
              {view === "dashboard"
                ? "Bonjour,"
                : ([...personnelNav, ...magasinNav, ...nav].find(
                    (n) => n[0] === view,
                  )?.[2] ?? "Paramètres")}
            </h1>
          </div>
          <div className="header-actions">
            <div className="date-nav">
              <button aria-label="Jour précédent" onClick={() => moveDate(-1)}>
                ‹
              </button>
              <input
                className="date-picker"
                type="date"
                aria-label="Sélectionner la date de travail"
                value={workDate}
                onChange={(event) => {
                  if (event.target.value)
                    setSelectedDate(new Date(`${event.target.value}T12:00:00`));
                }}
              />
              <button aria-label="Jour suivant" onClick={() => moveDate(1)}>
                ›
              </button>
            </div>
            <button className="bell">
              ♢<span />
            </button>
            <button className="primary" onClick={() => setView("pointage")}>
              ＋ Saisir la journée
            </button>
          </div>
        </header>

        {view === "dashboard" && (
          <Dashboard setView={setView} toast={toast} workDate={workDate} />
        )}
        {view === "presence" && (
          <MorningPresence
            workDate={workDate}
            dateLabel={dateLabel}
            toast={toast}
          />
        )}
        {view === "pointage" && (
          <Pointage
            accessToken={accessToken}
            workDate={workDate}
            dateLabel={dateLabel}
            toast={toast}
          />
        )}
        {view === "equipes" && (
          <Teams accessToken={accessToken} toast={toast} />
        )}
        {view === "interim" && (
          <Interim
            accessToken={accessToken}
            workDate={workDate}
            projectIdentity={projectIdentity}
            toast={toast}
          />
        )}
        {view === "taches" && <Tasks accessToken={accessToken} toast={toast} />}
        {view === "zones" && <Zones accessToken={accessToken} toast={toast} />}
        {view === "stock" && (
          <StockManager toast={toast} accessToken={accessToken} />
        )}
        {view === "engins" && (
          <MagasinManager
            section="engin"
            toast={toast}
            accessToken={accessToken}
          />
        )}
        {view === "outillage" && (
          <MagasinManager
            section="outillage"
            toast={toast}
            accessToken={accessToken}
          />
        )}
        {view === "acces" && (
          <MagasinManager
            section="acces"
            toast={toast}
            accessToken={accessToken}
          />
        )}
        {view === "travaux-supplementaires" && (
          <ExtraWorksManager toast={toast} accessToken={accessToken} />
        )}
        {view === "cables" && <Cables toast={toast} />}
        {view === "settings" && (
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
