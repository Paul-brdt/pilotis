"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { isoWeekNumber, type TimesheetSnapshot } from "@/lib/timesheet";
import { MorningPresence, WorkScheduleSettings } from "@/app/personnel";
import { MagasinManager } from "@/app/magasin";
import { StockManager } from "@/app/stock";
import { ExtraWorksManager } from "@/app/extra-works";

type View =
  | "dashboard"
  | "presence"
  | "pointage"
  | "equipes"
  | "interim"
  | "taches"
  | "zones"
  | "stock"
  | "engins"
  | "outillage"
  | "acces"
  | "cables"
  | "travaux-supplementaires"
  | "settings";

const people = [
  {
    initials: "E1",
    name: "Équipier 01",
    role: "Chef d’équipe",
    type: "Interne",
    coef: "—",
    hours: 8,
    agency: "—",
  },
  {
    initials: "E2",
    name: "Équipier 02",
    role: "Électricien N3P2",
    type: "Interne",
    coef: "—",
    hours: 8,
    agency: "—",
  },
  {
    initials: "E3",
    name: "Équipier 03",
    role: "Électricien",
    type: "Intérimaire",
    coef: "190",
    hours: 8,
    agency: "Agence Alpha",
  },
  {
    initials: "E4",
    name: "Équipier 04",
    role: "Monteur-câbleur",
    type: "Intérimaire",
    coef: "170",
    hours: 7,
    agency: "Agence Bêta",
  },
  {
    initials: "E5",
    name: "Équipier 05",
    role: "Électricien N2",
    type: "Interne",
    coef: "—",
    hours: 8,
    agency: "—",
  },
];

const agencies = [
  {
    name: "Agence Alpha",
    code: "AGA-01",
    address: "Adresse de démonstration",
    city: "Ville exemple",
    contact: "Contact Alpha",
    phone: "00 00 00 00 00",
    email: "contact.alpha@example.test",
    workers: 2,
    color: "#397f68",
  },
  {
    name: "Agence Bêta",
    code: "AGB-02",
    address: "Adresse de démonstration",
    city: "Ville exemple",
    contact: "Contact Bêta",
    phone: "00 00 00 00 00",
    email: "contact.beta@example.test",
    workers: 1,
    color: "#506fa7",
  },
  {
    name: "Agence Gamma",
    code: "AGG-03",
    address: "Adresse de démonstration",
    city: "Ville exemple",
    contact: "Contact Gamma",
    phone: "00 00 00 00 00",
    email: "contact.gamma@example.test",
    workers: 0,
    color: "#936f25",
  },
];

const tasks = [
  {
    code: "ETU-01",
    name: "Études & préparation",
    budget: 320,
    done: 248,
    color: "#936f25",
    zone: "Local électrique",
  },
  {
    code: "CDC-02",
    name: "Chemins de câbles",
    budget: 560,
    done: 493,
    color: "#397f68",
    zone: "Atelier production",
  },
  {
    code: "TIR-03",
    name: "Tirage de câbles",
    budget: 980,
    done: 612,
    color: "#506fa7",
    zone: "Utilités extérieures",
  },
  {
    code: "RAC-04",
    name: "Raccordements BT",
    budget: 720,
    done: 334,
    color: "#795b9d",
    zone: "Local électrique",
  },
  {
    code: "ESS-05",
    name: "Essais & mise en service",
    budget: 280,
    done: 56,
    color: "#b15e43",
    zone: "Atelier production",
  },
];

const zones = [
  {
    name: "Local électrique",
    code: "Z-01",
    budget: 1040,
    done: 582,
    physical: 68,
    tasks: 4,
    color: "#397f68",
    status: "En cours",
  },
  {
    name: "Atelier production",
    code: "Z-02",
    budget: 840,
    done: 549,
    physical: 61,
    tasks: 5,
    color: "#506fa7",
    status: "En cours",
  },
  {
    name: "Utilités extérieures",
    code: "Z-03",
    budget: 980,
    done: 612,
    physical: 54,
    tasks: 3,
    color: "#936f25",
    status: "À surveiller",
  },
  {
    name: "Bureaux & locaux sociaux",
    code: "Z-04",
    budget: 420,
    done: 126,
    physical: 32,
    tasks: 3,
    color: "#795b9d",
    status: "En cours",
  },
];

const cables = [
  ["C-0012", "TGBT-01", "MCC-03", "U1000 R2V 4G25", "86 m", "Tiré"],
  ["C-0013", "TGBT-01", "MCC-04", "U1000 R2V 4G16", "64 m", "À tirer"],
  ["C-0014", "API-01", "CAP-117", "LiYCY 2x2x0,75", "42 m", "Raccordé"],
  ["C-0015", "MCC-03", "MOT-208", "U1000 R2V 4G6", "118 m", "Tiré"],
  ["C-0016", "API-01", "EV-042", "LiYCY 4x0,75", "35 m", "À tirer"],
];

const stockItems = [
  {
    ref: "CAB-4G25",
    name: "Câble U1000 R2V 4G25",
    category: "Câbles",
    unit: "m",
    ordered: 1200,
    received: 800,
    stock: 286,
    min: 180,
    location: "Touret A-03",
  },
  {
    ref: "CDC-300",
    name: "Chemin de câble 300×60",
    category: "Chemins de câble",
    unit: "ml",
    ordered: 460,
    received: 460,
    stock: 74,
    min: 60,
    location: "Rack B-01",
  },
  {
    ref: "LUM-LED",
    name: "Luminaire LED étanche 48 W",
    category: "Luminaires",
    unit: "u",
    ordered: 180,
    received: 120,
    stock: 38,
    min: 25,
    location: "Magasin C-04",
  },
  {
    ref: "RAIL-41",
    name: "Rail supportage 41×41 · 3 m",
    category: "Supportage",
    unit: "u",
    ordered: 240,
    received: 240,
    stock: 21,
    min: 30,
    location: "Zone extérieure",
  },
  {
    ref: "BOUL-M8",
    name: "Boulonnerie M8 zinguée",
    category: "Boulonnerie",
    unit: "boîte",
    ordered: 40,
    received: 32,
    stock: 7,
    min: 8,
    location: "Magasin A-07",
  },
  {
    ref: "COL-200",
    name: "Colliers nylon 200×4,8",
    category: "Colliers",
    unit: "paquet",
    ordered: 80,
    received: 80,
    stock: 34,
    min: 15,
    location: "Magasin A-09",
  },
];

const personnelNav = [
  ["presence", "✓", "Présence du matin"],
  ["pointage", "◷", "Pointage journalier"],
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

type CurrentProfile = {
  id: string;
  full_name: string | null;
  role: string;
};

type ProjectIdentity = {
  id: string;
  code: string;
  name: string;
  location: string | null;
};

const accessLevels = [
  ["administrateur", "Administrateur"],
  ["bureau", "Bureau / chargé d’affaires"],
  ["conducteur", "Conducteur de travaux"],
  ["chef_chantier", "Chef de chantier"],
  ["magasinier", "Magasinier"],
  ["consultation", "Consultation"],
] as const;

function roleLabel(role?: string | null) {
  return (
    accessLevels.find(([value]) => value === role)?.[1] ?? "Profil utilisateur"
  );
}

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
  const [openNavSections,setOpenNavSections]=useState({personnel:true,magasin:true,chantier:true});
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
      setAccountError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (newPassword !== passwordConfirmation) {
      setAccountError("La confirmation ne correspond pas au nouveau mot de passe.");
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
          <button
            className="primary"
            type="submit"
          >
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
      <aside className="sidebar">
        <div className="brand">
          <span className="brandmark">P</span>
          <div>
            <b>PILOTIS</b>
            <small>CHANTIER ÉLECTRIQUE</small>
          </div>
        </div>
        <div className="project-switch">
          <span>CHANTIER ACTIF</span>
          <b>{projectIdentity?.name ?? "Chargement du chantier…"}</b>
          <small>
            {[projectIdentity?.location, projectIdentity?.code]
              .filter(Boolean)
              .join(" · ") || "—"} ↕
          </small>
        </div>
        <nav>
          {nav.slice(0, 1).map(([id, icon, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={view === id ? "active" : ""}
            >
              <i>{icon}</i>
              {label}
            </button>
          ))}
          <button type="button" className="nav-section-toggle" aria-expanded={openNavSections.personnel} onClick={()=>setOpenNavSections(current=>({...current,personnel:!current.personnel}))}><span>PERSONNEL</span><i>{openNavSections.personnel?"⌃":"⌄"}</i></button>
          {openNavSections.personnel&&personnelNav.map(([id, icon, label]) => (
            <button key={id} onClick={() => setView(id)} className={view === id ? "active" : ""}><i>{icon}</i>{label}</button>
          ))}
          <button type="button" className="nav-section-toggle" aria-expanded={openNavSections.magasin} onClick={()=>setOpenNavSections(current=>({...current,magasin:!current.magasin}))}><span>MAGASIN</span><i>{openNavSections.magasin?"⌃":"⌄"}</i></button>
          {openNavSections.magasin&&magasinNav.map(([id, icon, label]) => (
            <button key={id} onClick={() => setView(id)} className={view === id ? "active" : ""}><i>{icon}</i>{label}</button>
          ))}
          <button type="button" className="nav-section-toggle" aria-expanded={openNavSections.chantier} onClick={()=>setOpenNavSections(current=>({...current,chantier:!current.chantier}))}><span>CHANTIER</span><i>{openNavSections.chantier?"⌃":"⌄"}</i></button>
          {openNavSections.chantier&&nav.slice(1).map(([id, icon, label]) => (
            <button key={id} onClick={() => setView(id)} className={view === id ? "active" : ""}><i>{icon}</i>{label}</button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            onClick={() => setView("settings")}
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
                <button className="account-signout" type="button" role="menuitem" onClick={signOut}>
                  <i>↪</i> Se déconnecter
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header>
          <button className="mobile-menu">☰</button>
          <div>
            <span className="crumb">
              CHANTIERS / {projectIdentity?.code ?? "…"}
            </span>
            <h1>
              {view === "dashboard"
                ? "Bonjour,"
                : ([...personnelNav, ...magasinNav, ...nav].find((n) => n[0] === view)?.[2] ?? "Paramètres")}
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
                  if (event.target.value) setSelectedDate(new Date(`${event.target.value}T12:00:00`));
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
        {view === "presence" && <MorningPresence workDate={workDate} dateLabel={dateLabel} toast={toast} />}
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
        {view === "interim" && <Interim accessToken={accessToken} workDate={workDate} projectIdentity={projectIdentity} toast={toast} />}
        {view === "taches" && <Tasks accessToken={accessToken} toast={toast} />}
        {view === "zones" && (
          <Zones accessToken={accessToken} toast={toast} />
        )}
        {view === "stock" && <StockManager toast={toast} accessToken={accessToken} />}
        {view === "engins" && <MagasinManager section="engin" toast={toast} accessToken={accessToken} />}
        {view === "outillage" && <MagasinManager section="outillage" toast={toast} accessToken={accessToken} />}
        {view === "acces" && <MagasinManager section="acces" toast={toast} accessToken={accessToken} />}
        {view === "travaux-supplementaires" && <ExtraWorksManager toast={toast} accessToken={accessToken} />}
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
            <p>Utilisez au moins 8 caractères. Une phrase de passe unique est recommandée.</p>
            <label>
              Mot de passe actuel
              <input name="currentPassword" type="password" autoComplete="current-password" required />
            </label>
            <label>
              Nouveau mot de passe
              <input name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
            </label>
            <label>
              Confirmer le nouveau mot de passe
              <input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={8} required />
            </label>
            {accountError && <div className="auth-error">{accountError}</div>}
            <div className="account-dialog-actions">
              <button type="button" onClick={() => setPasswordDialogOpen(false)} disabled={accountSaving}>
                Annuler
              </button>
              <button className="primary" type="submit" disabled={accountSaving}>
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

function Dashboard({
  setView,
  toast,
  workDate,
}: {
  setView: (v: View) => void;
  toast: (s: string) => void;
  workDate: string;
}) {
  type Period = "day" | "week" | "month" | "all";
  type DashboardTask = { id: string; code: string; name: string; budget_hours: number | string };
  type DashboardZone = { id: string; code: string; name: string; physical_progress: number | string };
  type DashboardEntry = {
    person_id: string; task_id: string; zone_id: string | null; work_date: string;
    hours: number | string; created_at: string;
  };
  type DashboardAttendance = { person_id: string; work_date: string; status: string; regular_hours: number | string; automatic_overtime_hours: number | string; manual_overtime_hours: number | string | null };
  type DashboardSchedule = { weekday: number; is_working_day: boolean; theoretical_hours: number | string };
  type DashboardEquipment = { id:string; category:"engin"|"outillage"|"acces"; internal_reference:string; description:string; vic_due_date:string|null; rental_planned_end_date:string|null; rental_actual_end_date:string|null; status:string; active:boolean };

  const [period, setPeriod] = useState<Period>("week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState(workDate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [peopleRows, setPeopleRows] = useState<PersonRow[]>([]);
  const [taskRows, setTaskRows] = useState<DashboardTask[]>([]);
  const [zoneRows, setZoneRows] = useState<DashboardZone[]>([]);
  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<DashboardAttendance[]>([]);
  const [scheduleRows, setScheduleRows] = useState<DashboardSchedule[]>([]);
  const [equipmentRows, setEquipmentRows] = useState<DashboardEquipment[]>([]);
  const [vicWarningDays, setVicWarningDays] = useState(30);

  const dateRange = useMemo(() => {
    const anchor = new Date(`${workDate}T12:00:00`);
    const start = new Date(anchor);
    const end = new Date(anchor);
    if (period === "week") {
      const offset = (anchor.getDay() + 6) % 7;
      start.setDate(anchor.getDate() - offset);
      end.setDate(start.getDate() + 6);
    } else if (period === "month") {
      start.setDate(1);
      end.setMonth(start.getMonth() + 1, 0);
    } else if (period === "all") {
      if (customStart) start.setTime(new Date(`${customStart}T12:00:00`).getTime());
      else start.setFullYear(2000, 0, 1);
      end.setTime(new Date(`${customEnd || workDate}T12:00:00`).getTime());
    }
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    return { start: iso(start), end: iso(end) };
  }, [period, workDate, customStart, customEnd]);

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      setLoading(true);
      setError("");
      const db = createSupabaseBrowserClient();
      const { data: project, error: projectError } = await db
        .from("projects").select("id,vic_warning_days").eq("code", "24-018").single();
      if (!project || projectError) {
        if (active) { setError("Le chantier n’a pas pu être chargé."); setLoading(false); }
        return;
      }
      const [personsResult, tasksResult, zonesResult, entriesResult, attendanceResult, schedulesResult, equipmentResult] = await Promise.all([
        db.from("people")
          .select("id,full_name,qualification,contract_type,coefficient,active,agency_id,agencies(name)")
          .eq("project_id", project.id).eq("active", true).order("full_name"),
        db.from("tasks").select("id,code,name,budget_hours")
          .eq("project_id", project.id).order("code"),
        db.from("zones").select("id,code,name,physical_progress")
          .eq("project_id", project.id).order("code"),
        db.from("time_entries")
          .select("person_id,task_id,zone_id,work_date,hours,created_at")
          .eq("project_id", project.id).order("created_at", { ascending: false }),
        db.from("daily_attendance").select("person_id,work_date,status,regular_hours,automatic_overtime_hours,manual_overtime_hours").eq("project_id", project.id).gte("work_date", dateRange.start < workDate ? dateRange.start : workDate).lte("work_date", dateRange.end > workDate ? dateRange.end : workDate),
        db.from("project_work_schedules").select("weekday,is_working_day,theoretical_hours").eq("project_id", project.id),
        db.from("equipment_assets").select("id,category,internal_reference,description,vic_due_date,rental_planned_end_date,rental_actual_end_date,status,active").eq("project_id",project.id).eq("active",true),
      ]);
      const firstError = personsResult.error || tasksResult.error || zonesResult.error || entriesResult.error;
      if (!active) return;
      if (firstError) setError("Certaines données du tableau de bord sont indisponibles.");
      setPeopleRows((personsResult.data || []) as unknown as PersonRow[]);
      setTaskRows((tasksResult.data || []) as DashboardTask[]);
      setZoneRows((zonesResult.data || []) as DashboardZone[]);
      setEntries((entriesResult.data || []) as DashboardEntry[]);
      setAttendanceRows((attendanceResult.data || []) as DashboardAttendance[]);
      setScheduleRows((schedulesResult.data || []) as DashboardSchedule[]);
      setEquipmentRows((equipmentResult.data || []) as DashboardEquipment[]);
      setVicWarningDays(Number(project.vic_warning_days || 30));
      setLoading(false);
    }
    loadDashboard();
    return () => { active = false; };
  }, [dateRange.start, dateRange.end, workDate]);

  const hours = (rows: DashboardEntry[]) => rows.reduce((sum, row) => sum + Number(row.hours || 0), 0);
  const periodEntries = entries.filter((entry) => entry.work_date >= dateRange.start && entry.work_date <= dateRange.end);
  const totalHours = hours(periodEntries);
  const todayEntries = entries.filter((entry) => entry.work_date === workDate);
  const todayHours = hours(todayEntries);
  const todayAttendance = attendanceRows.filter((row) => row.work_date === workDate);
  const presentIds = new Set(todayAttendance.filter((row) => row.status === "present").map((row) => row.person_id));
  const recordedIds = new Set(todayAttendance.filter((row) => row.status !== "non_renseigne").map((row) => row.person_id));
  const missingPeople = peopleRows.filter((person) => !recordedIds.has(person.id));
  const internalCount = peopleRows.filter((person) => person.contract_type === "interne").length;
  const interimCount = peopleRows.length - internalCount;
  const periodDays = period === "day" ? 1 : Math.max(1, Math.round((new Date(`${dateRange.end}T12:00:00`).getTime() - new Date(`${dateRange.start}T12:00:00`).getTime()) / 86400000) + 1);
  const expectedHours = Array.from({ length: periodDays }, (_, i) => {
    const date = new Date(`${dateRange.start}T12:00:00`); date.setDate(date.getDate() + i);
    const schedule = scheduleRows.find((row) => row.weekday === date.getDay());
    return schedule?.is_working_day ? Number(schedule.theoretical_hours) * peopleRows.length : 0;
  }).reduce((sum, value) => sum + value, 0);
  const completion = expectedHours ? Math.round((totalHours / expectedHours) * 100) : 0;

  const taskStats = taskRows.map((task, index) => {
    const done = hours(entries.filter((entry) => entry.task_id === task.id));
    const budget = Number(task.budget_hours || 0);
    return { ...task, done, budget, percent: budget ? Math.round((done / budget) * 100) : 0, color: ["#397f68", "#506fa7", "#936f25", "#795b9d", "#b15e43"][index % 5] };
  }).sort((a, b) => b.percent - a.percent);
  const totalBudget = taskRows.reduce((sum, task) => sum + Number(task.budget_hours || 0), 0);
  const budgetUsed = totalBudget ? Math.round((totalHours / totalBudget) * 100) : 0;
  const zoneStats = zoneRows.map((zone) => ({
    ...zone,
    hours: hours(periodEntries.filter((entry) => entry.zone_id === zone.id)),
    physical: Number(zone.physical_progress || 0),
  })).sort((a, b) => b.hours - a.hours);

  const alerts = [
    ...(missingPeople.length ? [{ tone: "gold", title: `${missingPeople.length} présence${missingPeople.length > 1 ? "s" : ""} à renseigner le ${new Date(`${workDate}T12:00:00`).toLocaleDateString("fr-FR")}`, detail: missingPeople.slice(0, 3).map((p) => p.full_name).join(", "), view: "presence" as View }] : []),
    ...taskStats.filter((task) => task.percent >= 100).map((task) => ({ tone: "red", title: `Budget dépassé · ${task.code}`, detail: `${task.done.toLocaleString("fr-FR")} h sur ${task.budget.toLocaleString("fr-FR")} h`, view: "taches" as View })),
    ...taskStats.filter((task) => task.percent >= 80 && task.percent < 100).map((task) => ({ tone: "gold", title: `Budget à surveiller · ${task.code}`, detail: `${task.percent}% consommé`, view: "taches" as View })),
    ...zoneStats.filter((zone) => zone.physical === 0 && zone.hours > 0).map((zone) => ({ tone: "blue", title: `Avancement à renseigner · ${zone.code}`, detail: `${zone.hours.toLocaleString("fr-FR")} h déjà affectées`, view: "zones" as View })),
    ...equipmentRows.flatMap((asset) => {
      const rows: Array<{tone:string;title:string;detail:string;view:View}> = [];
      const remaining = (date:string|null) => date === null ? null : Math.ceil((new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86400000);
      const vicDays = remaining(asset.vic_due_date);
      const equipmentView:View = asset.category === "engin" ? "engins" : asset.category === "outillage" ? "outillage" : "acces";
      if (vicDays !== null && vicDays < 0) rows.push({ tone:"red", title:`VIC dépassée · ${asset.internal_reference}`, detail:asset.description, view:equipmentView });
      else if (vicDays !== null && vicDays <= vicWarningDays) rows.push({ tone:"gold", title:`VIC à programmer · ${asset.internal_reference}`, detail:`${vicDays} jour(s) avant échéance`, view:equipmentView });
      const rentalDays = asset.rental_actual_end_date ? null : remaining(asset.rental_planned_end_date);
      if (rentalDays !== null && rentalDays <= vicWarningDays) rows.push({ tone:rentalDays < 0 ? "red" : "blue", title:`Location ${rentalDays < 0 ? "échue" : "à terminer"} · ${asset.internal_reference}`, detail:asset.description, view:equipmentView });
      if (["maintenance","hors_service"].includes(asset.status)) rows.push({ tone:asset.status === "hors_service" ? "red" : "gold", title:`${asset.status === "hors_service" ? "Hors service" : "Maintenance"} · ${asset.internal_reference}`, detail:asset.description, view:equipmentView });
      return rows;
    }),
  ].slice(0, 5);

  const periodLabels: Record<Period, string> = { day: "Jour", week: "Semaine", month: "Mois", all: "Cumul" };
  return (
    <div className="content">
      <section className="intro">
        <div>
          <h2>Voici où en est votre chantier aujourd’hui.</h2>
          <p>Données actualisées depuis les pointages du chantier</p>
        </div>
        <div className="dashboard-period" aria-label="Période du tableau de bord">
          {(Object.keys(periodLabels) as Period[]).map((key) => (
            <button className={period === key ? "active" : ""} key={key} onClick={() => {
              if (key === "all" && !customStart && entries.length) {
                setCustomStart(entries.reduce((earliest, entry) => entry.work_date < earliest ? entry.work_date : earliest, entries[0].work_date));
              }
              if (key === "all" && !customEnd) setCustomEnd(workDate);
              setPeriod(key);
            }}>{periodLabels[key]}</button>
          ))}
          {period === "all" ? <div className="dashboard-custom-range">
            <label>Du<input type="date" value={customStart} max={customEnd || workDate} onChange={(event) => setCustomStart(event.target.value)} /></label>
            <label>Au<input type="date" value={customEnd} min={customStart} onChange={(event) => setCustomEnd(event.target.value)} /></label>
          </div> : null}
        </div>
      </section>
      {error && <div className="dashboard-error">{error}</div>}
      <section className="kpis">
        <Kpi
          label="POINTAGE DE LA PÉRIODE"
          value={loading ? "…" : `${totalHours.toLocaleString("fr-FR")} h`}
          detail={expectedHours ? `sur ${expectedHours.toLocaleString("fr-FR")} h théoriques` : "Aucune heure théorique sur la période"}
          tone="green"
          ring={Math.min(completion, 100)}
        />
        <Kpi
          label="BUDGET CONSOMMÉ"
          value={loading ? "…" : `${budgetUsed}%`}
          detail={`${totalBudget.toLocaleString("fr-FR")} h budgétées`}
          tone="blue"
          progress={Math.min(budgetUsed, 100)}
        />
        <Kpi
          label="ÉQUIPE AUJOURD’HUI"
          value={loading ? "…" : `${presentIds.size}/${peopleRows.length} pers.`}
          detail={`${internalCount} internes · ${interimCount} intérimaires`}
          tone="gold"
          avatars
        />
        <Kpi
          label="À AFFECTER AUJOURD’HUI"
          value={loading ? "…" : `${Math.max(0, todayAttendance.reduce((sum, row) => row.status === "present" ? sum + Number(row.regular_hours) + Number(row.manual_overtime_hours ?? row.automatic_overtime_hours) : sum, 0) - todayHours).toLocaleString("fr-FR")} h`}
          detail={`${todayHours.toLocaleString("fr-FR")} h déjà pointées`}
          tone={todayHours > todayAttendance.reduce((sum, row) => row.status === "present" ? sum + Number(row.regular_hours) + Number(row.manual_overtime_hours ?? row.automatic_overtime_hours) : sum, 0) ? "red" : "gold"}
        />
      </section>
      <section className="two-cols">
        <div className="panel task-panel">
          <div className="panel-title">
            <div>
              <span>CONSOMMATION PAR TÂCHE</span>
              <h3>Budget d’heures vs réalisé</h3>
            </div>
            <button onClick={() => setView("taches")}>Voir le détail →</button>
          </div>
          <div className="task-head">
            <span>TÂCHE</span>
            <span>BUDGET</span>
            <span>RÉALISÉ</span>
            <span>AVANCEMENT</span>
          </div>
          {taskStats.slice(0, 5).map((t) => {
            const p = t.percent;
            return (
              <div className="task-row" key={t.code}>
                <div>
                  <i style={{ background: t.color }} />
                  <span>
                    <b>{t.name}</b>
                    <small>{t.code}</small>
                  </span>
                </div>
                <strong>{t.budget} h</strong>
                <strong>{t.done} h</strong>
                <div>
                  <span>{p}%</span>
                  <div className="bar">
                    <i style={{ width: `${p}%`, background: t.color }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="panel dashboard-alerts dashboard-alerts-inline">
          <div className="panel-title">
            <div>
              <span>POINTS D’ATTENTION</span>
              <h3>Alertes actionnables</h3>
            </div>
            <b>{alerts.length}</b>
          </div>
          {alerts.length ? alerts.map((alert, index) => (
            <button key={`${alert.title}-${index}`} onClick={() => setView(alert.view)}>
              <i className={alert.tone}>!</i><span><b>{alert.title}</b><small>{alert.detail}</small></span><em>›</em>
            </button>
          )) : <p className="dashboard-empty">Aucune alerte sur la période sélectionnée.</p>}
        </div>
      </section>
      <section className="bottom-grid">
        <div className="panel dashboard-zones">
          <div className="panel-title">
            <div>
              <span>AVANCEMENT PAR ZONE</span>
              <h3>Heures et avancement physique</h3>
            </div>
            <button onClick={() => setView("zones")}>Voir les zones →</button>
          </div>
          <div className="dashboard-zone-list">
            {zoneStats.map((zone) => (
              <div className="dashboard-zone-row" key={zone.id}>
                <div><b>{zone.name}</b><small>{zone.code} · {zone.hours.toLocaleString("fr-FR")} h</small></div>
                <div className="dashboard-zone-progress"><span>{zone.physical}%</span><div className="bar"><i style={{ width: `${zone.physical}%` }} /></div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="quick">
          <span>ACTIONS RAPIDES</span>
          <button onClick={() => setView("pointage")}>
            <i>◷</i>
            <div>
              <b>Saisir les heures</b>
              <small>{new Date(`${workDate}T12:00:00`).toLocaleDateString("fr-FR")}</small>
            </div>
            <em>›</em>
          </button>
          <button onClick={() => setView("cables")}>
            <i>⇧</i>
            <div>
              <b>Importer un carnet</b>
              <small>Fichier Excel client</small>
            </div>
            <em>›</em>
          </button>
          <button onClick={() => toast("La génération de rapport sera ajoutée au prochain lot")}>
            <i>▤</i>
            <div>
              <b>Générer le rapport</b>
              <small>Semaine {isoWeekNumber(new Date(`${workDate}T12:00:00`))}</small>
            </div>
            <em>›</em>
          </button>
        </div>
      </section>
    </div>
  );
}

type PersonRow = {
  id: string;
  full_name: string;
  qualification: string | null;
  contract_type: "interne" | "interimaire";
  coefficient: string | null;
  active: boolean;
  agency_id: string | null;
  agencies?: { name: string } | null;
};
type AgencyRow = {
  id: string; name: string; code: string; address: string | null;
  postal_code: string | null; city: string | null; contact_name: string | null;
  phone: string | null; email: string | null; active: boolean;
};
type QualificationRow = { id: string; name: string; active: boolean };
type WorkTask = {
  id: string;
  code: string;
  name: string;
};
type WorkZone = { id: string; code: string; name: string };
type DailyTimeEntry = {
  person_id: string;
  hours: number | string;
  tasks: { code: string } | null;
  zones: { code: string } | null;
};
type DailyAssignment = { hours: number; taskCode: string; zoneCode: string };
type DailyAttendanceTarget = { person_id: string; status: string; scheduled_hours: number | string; regular_hours: number | string; automatic_overtime_hours: number | string; manual_overtime_hours: number | string | null };

function Pointage({
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
  const [attendanceTargets, setAttendanceTargets] = useState<Record<string, DailyAttendanceTarget>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [taskId, setTaskId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [hours, setHours] = useState("8");
  const [comment, setComment] = useState("");
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
        .select("person_id,hours,tasks(code),zones(code)")
        .eq("project_id", project.id)
        .eq("work_date", workDate)
        .order("created_at", { ascending: true }),
      db.from("daily_attendance").select("person_id,status,scheduled_hours,regular_hours,automatic_overtime_hours,manual_overtime_hours").eq("project_id", project.id).eq("work_date", workDate),
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
    setPeopleRows((persons ?? []) as unknown as PersonRow[]);
    setTaskRows((loadedTasks ?? []) as WorkTask[]);
    setZoneRows((loadedZones ?? []) as WorkZone[]);
    setAssignedHours(totals);
    setDailyAssignments(summaries);
    setAttendanceTargets(Object.fromEntries(((attendance ?? []) as DailyAttendanceTarget[]).map((row) => [row.person_id, row])));
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
          <h2>Pointage du {dateLabel}</h2>
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
            const targetHours = attendance?.status === "present" ? Number(attendance.regular_hours) + Number(attendance.manual_overtime_hours ?? attendance.automatic_overtime_hours) : 0;
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
                  })} h
                  {attendance && <small className={remainingHours < 0 ? "over" : remainingHours > 0 ? "under" : "complete"}>{targetHours.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h cible · {remainingHours > 0 ? `${remainingHours.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h restantes` : remainingHours < 0 ? `${Math.abs(remainingHours).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h en trop` : "complet"}</small>}
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
    </div>
  );
}

function Teams({
  accessToken,
  toast,
}: {
  accessToken: string;
  toast: (s: string) => void;
}) {
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [agencyRows, setAgencyRows] = useState<AgencyRow[]>([]);
  const [qualificationRows, setQualificationRows] = useState<QualificationRow[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contractType, setContractType] = useState<"interne" | "interimaire">("interne");
  async function load() {
    const db = createSupabaseBrowserClient();
    const project = (
      await db.from("projects").select("id").eq("code", "24-018").single()
    ).data;
    if (!project) return;
    const [{ data }, { data: loadedAgencies }, { data: loadedQualifications }] = await Promise.all([
      db.from("people").select("id,full_name,qualification,contract_type,coefficient,active,agency_id,agencies(name)").eq("project_id", project.id).order("full_name"),
      db.from("agencies").select("id,name,code,address,postal_code,city,contact_name,phone,email,active").eq("project_id", project.id).eq("active", true).order("name"),
      db.from("qualifications").select("id,name,active").eq("project_id", project.id).eq("active", true).order("name"),
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
            Gérez les personnes qui seront proposées au pointage journalier.
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
          ＋ Ajouter une personne
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
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
              >
                ×
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
                <option value="" disabled>Sélectionner une qualification</option>
                {qualificationRows.map((qualification) => (
                  <option key={qualification.id} value={qualification.name}>{qualification.name}</option>
                ))}
              </select>
            </label>
            <label>
              Contrat
              <select
                name="contractType"
                value={contractType}
                onChange={(event) => setContractType(event.target.value as "interne" | "interimaire")}
              >
                <option value="interne">Interne</option>
                <option value="interimaire">Intérimaire</option>
              </select>
            </label>
            {contractType === "interimaire" && (
              <label>
                Agence d’intérim
                <select name="agencyId" defaultValue={editing?.agency_id ?? ""} required>
                  <option value="" disabled>Sélectionner une agence existante</option>
                  {agencyRows.map((agency) => (
                    <option key={agency.id} value={agency.id}>{agency.code} · {agency.name}</option>
                  ))}
                </select>
                {agencyRows.length === 0 && <small>Créez d’abord une agence dans Intérim & feuilles.</small>}
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

function Interim({ accessToken, workDate, projectIdentity, toast }: { accessToken: string; workDate: string; projectIdentity: ProjectIdentity | null; toast: (s: string) => void }) {
  type InterimPerson = PersonRow & { agency_id: string };
  type WeekEntry = { person_id: string; work_date: string; hours: number | string };
  type GeneratedSheet = { agency_id: string; week_start: string; status: string; generated_at: string; snapshot: TimesheetSnapshot | null };
  const [tab, setTab] = useState<"feuilles" | "agences">("feuilles");
  const [agencyRows, setAgencyRows] = useState<AgencyRow[]>([]);
  const [interimPeople, setInterimPeople] = useState<InterimPerson[]>([]);
  const [entries, setEntries] = useState<WeekEntry[]>([]);
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
      db.from("time_entries").select("person_id,work_date,hours").eq("project_id", project.id).gte("work_date", weekStart).lte("work_date", weekEnd),
      db.from("weekly_timesheets").select("agency_id,week_start,status,generated_at,snapshot").eq("project_id", project.id).order("week_start", { ascending: false }),
    ]);
    const loaded = (loadedAgencies ?? []) as AgencyRow[];
    setAgencyRows(loaded); setInterimPeople((loadedPeople ?? []) as unknown as InterimPerson[]); setEntries((loadedEntries ?? []) as WeekEntry[]); setGeneratedSheets((loadedSheets ?? []) as GeneratedSheet[]);
    setSelectedAgencyId((current) => loaded.some((item) => item.id === current) ? current : loaded.find((item) => item.active)?.id ?? loaded[0]?.id ?? "");
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [weekStart]);
  const selectedAgency = agencyRows.find((item) => item.id === selectedAgencyId) ?? null;
  const peopleForAgency = interimPeople.filter((person) => person.agency_id === selectedAgencyId);
  const currentSheet = generatedSheets.find((sheet) => sheet.agency_id === selectedAgencyId && sheet.week_start === weekStart);
  const sheets = peopleForAgency.map((person) => {
    const hours = weekDays.map((date) => entries.filter((entry) => entry.person_id === person.id && entry.work_date === date.toLocaleDateString("en-CA")).reduce((sum, entry) => sum + Number(entry.hours), 0));
    return { person, hours, total: hours.reduce((sum, value) => sum + value, 0), meals: hours.filter((value) => value > 5).length };
  });
  const displayedSheets = currentSheet?.snapshot?.workers.map((worker) => ({
    person: { id: worker.id, full_name: worker.name, qualification: worker.qualification, coefficient: worker.coefficient },
    hours: worker.hours, total: worker.total, meals: worker.meals,
  })) ?? sheets;
  const displayedDays = currentSheet?.snapshot?.days ?? weekDays.map((date) => ({ date: date.toLocaleDateString("en-CA"), label: date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit" }).toUpperCase() }));
  const agencyHistory = generatedSheets.filter((sheet) => sheet.agency_id === selectedAgencyId);
  const agencyTotals = new Map(agencyRows.map((agency) => { const workers = interimPeople.filter((person) => person.agency_id === agency.id); const total = entries.filter((entry) => workers.some((person) => person.id === entry.person_id)).reduce((sum, entry) => sum + Number(entry.hours), 0); return [agency.id, total]; }));
  const totalHours = entries.filter((entry) => interimPeople.some((person) => person.id === entry.person_id)).reduce((sum, entry) => sum + Number(entry.hours), 0);
  const totalMeals = interimPeople.reduce((sum, person) => sum + weekDays.filter((date) => entries.filter((entry) => entry.person_id === person.id && entry.work_date === date.toLocaleDateString("en-CA")).reduce((dayTotal, entry) => dayTotal + Number(entry.hours), 0) > 5).length, 0);
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

type TaskRow = {
  id: string;
  code: string;
  name: string;
  budget_hours: number;
};

function Tasks({
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
    const [
      { data: loadedTasks, error: tasksError },
      { data: entries },
    ] = await Promise.all([
      db
        .from("tasks")
        .select("id,code,name,budget_hours")
        .eq(
          "project_id",
          (await db.from("projects").select("id").eq("code", "24-018").single())
            .data?.id ?? "",
        )
        .order("code"),
      db.from("time_entries").select("task_id,hours"),
    ]);
    if (tasksError) {
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
    editing ??
    ({ code: "", name: "", budget_hours: 0 } as TaskRow);
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
          {taskRows.length} type{taskRows.length > 1 ? "s" : ""} de tâche · budgets sans affectation de zone
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
type ManagedZone = {
  id: string;
  code: string;
  name: string;
  physical_progress: number;
};

type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
};

function Settings({
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
  const [tab, setTab] = useState<"chantier" | "application" | "horaires" | "qualifications" | "users">(
    "chantier",
  );
  const [project, setProject] = useState<ProjectSettings | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [qualificationRows, setQualificationRows] = useState<QualificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [error, setError] = useState("");
  const isAdministrator = currentProfile?.role === "administrateur";
  async function load() {
    setLoading(true);
    const db = createSupabaseBrowserClient();
    const [{ data: projectData, error: projectError }, { data: loadedQualifications }] = await Promise.all([
      db.from("projects").select("id,code,name,location,contact_name,contact_email,contact_phone,primary_color,logo_url,session_timeout_minutes").eq("code", "24-018").single(),
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
        sessionTimeoutMinutes: Number(
          form.get("sessionTimeoutMinutes") ?? 30,
        ),
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
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try { await send({ kind: "qualification-create", name: String(form.get("name") ?? "") }); toast("Qualification ajoutée"); event.currentTarget.reset(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); } finally { setSaving(false); }
  }
  async function toggleQualification(qualification: QualificationRow) {
    setSaving(true); setError("");
    try { await send({ kind: "qualification-active", qualificationId: qualification.id, active: !qualification.active }); toast(qualification.active ? "Qualification désactivée" : "Qualification réactivée"); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); } finally { setSaving(false); }
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
        <button className={tab === "horaires" ? "active" : ""} onClick={() => setTab("horaires")}>Horaires</button>
        <button className={tab === "qualifications" ? "active" : ""} onClick={() => setTab("qualifications")}>Qualifications</button>
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
          <form className="panel settings-form" onSubmit={createQualification}>
            <div className="panel-title"><div><span>RÉFÉRENTIEL ÉQUIPES</span><h3>Qualifications proposées dans les fiches personnes</h3></div></div>
            <div className="settings-grid"><label>Nouvelle qualification<input name="name" required placeholder="Ex. Électricien N3P2" /></label></div>
            <div className="settings-actions"><button className="primary" disabled={saving}>{saving ? "Enregistrement…" : "Ajouter la qualification"}</button></div>
          </form>
          <div className="panel user-management-list">
            {qualificationRows.map((qualification) => <div className="user-management-row" key={qualification.id}><div><b>{qualification.name}</b><small>{qualification.active ? "Disponible dans les listes" : "Désactivée"}</small></div><span className={qualification.active ? "green-pill" : "status inactive"}>● {qualification.active ? "Active" : "Inactive"}</span><button className="text-action" disabled={saving} onClick={() => void toggleQualification(qualification)}>{qualification.active ? "Désactiver" : "Réactiver"}</button></div>)}
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
              <button
                type="button"
                onClick={() => setShowUser(false)}
              >
                ×
              </button>
            </div>
            <label>
              Nom complet
              <input
                name="fullName"
                required
                placeholder="Prénom et nom"
              />
            </label>
            <label>
              Adresse e-mail
              <input
                name="email"
                type="email"
                required
                autoComplete="off"
              />
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

function Zones({
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingZone, setEditingZone] = useState<ManagedZone | null>(null);
  const [showZone, setShowZone] = useState(false);
  const [showAllocation, setShowAllocation] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState<ZoneAllocation | null>(null);
  const [allocationTaskId, setAllocationTaskId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const db = createSupabaseBrowserClient();
    const [{ data: zoneData, error: zoneError }, { data: taskData }, { data: allocationData }, { data: entries }] =
      await Promise.all([
        db.from("zones").select("id,code,name,physical_progress").order("code"),
        db.from("tasks").select("id,code,name,budget_hours").order("code"),
        db.from("zone_task_budget_allocations").select("id,zone_id,task_id,allocated_hours"),
        db.from("time_entries").select("task_id,zone_id,hours"),
      ]);
    if (zoneError) {
      setError("Impossible de charger les zones de travail.");
      setLoading(false);
      return;
    }
    const loadedZones = (zoneData ?? []) as ManagedZone[];
    const doneByTaskAndZone = new Map<string, number>();
    for (const entry of entries ?? []) {
      const key = `${entry.task_id}:${entry.zone_id}`;
      doneByTaskAndZone.set(
        key,
        (doneByTaskAndZone.get(key) ?? 0) + Number(entry.hours),
      );
    }
    setManagedZones(loadedZones);
    setZoneTasks(
      (taskData ?? []).map((task) => ({
        ...task,
        budget_hours: Number(task.budget_hours),
      })) as ZoneTask[],
    );
    setAllocations((allocationData ?? []).map((allocation) => ({
      ...allocation,
      allocated_hours: Number(allocation.allocated_hours),
      done: doneByTaskAndZone.get(`${allocation.task_id}:${allocation.zone_id}`) ?? 0,
    })) as ZoneAllocation[]);
    setSelectedId((current) =>
      loadedZones.some((zone) => zone.id === current)
        ? current
        : loadedZones[0]?.id ?? null,
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
        headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          kind: "zone-allocation-save",
          allocationId: editingAllocation?.id,
          zoneId: selectedId,
          taskId: String(form.get("taskId") ?? ""),
          allocatedHours: Number(form.get("allocatedHours")),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Allocation impossible");
      toast(editingAllocation ? "Allocation mise à jour" : "Budget alloué à la zone");
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
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ kind: "zone-allocation-delete", allocationId: allocation.id, zoneId: selectedId, taskId: allocation.task_id }),
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
  const allocationsForZone = allocations.filter((allocation) => allocation.zone_id === z?.id);
  const tasksForZone = allocationsForZone.flatMap((allocation) => {
    const task = zoneTasks.find((item) => item.id === allocation.task_id);
    return task ? [{ ...task, allocationId: allocation.id, allocated_hours: allocation.allocated_hours, done: allocation.done }] : [];
  });
  const budget = tasksForZone.reduce(
    (sum, task) => sum + task.allocated_hours,
    0,
  );
  const done = tasksForZone.reduce((sum, task) => sum + task.done, 0);
  const consumption = budget ? Math.round((done / budget) * 100) : 0;
  const allBudget = allocations.reduce((sum, allocation) => sum + allocation.allocated_hours, 0);
  const allDone = allocations.reduce((sum, allocation) => sum + allocation.done, 0);
  const averageProgress = managedZones.length
    ? Math.round(
        managedZones.reduce(
          (sum, zone) => sum + Number(zone.physical_progress),
          0,
        ) / managedZones.length,
      )
    : 0;
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
          ＋ Nouvelle zone
        </button>
      </div>
      {error && <div className="settings-error">{error}</div>}
      <div className="zone-overview">
        <Kpi
          label="ZONES ACTIVES"
          value={String(managedZones.length)}
          detail={`${allocations.length} allocations budgétaires`}
          tone="green"
        />
        <Kpi
          label="AVANCEMENT MOYEN"
          value={`${averageProgress}%`}
          detail="moyenne des zones configurées"
          tone="blue"
          progress={averageProgress}
        />
        <Kpi
          label="HEURES CONSOMMÉES"
          value={`${allDone.toLocaleString("fr-FR")} h`}
          detail={`sur ${allBudget.toLocaleString("fr-FR")} h budgétées`}
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
            const zoneDone = relatedTasks.reduce(
              (sum, allocation) => sum + allocation.done,
              0,
            );
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
                      {zoneDone} / {zoneBudget} h
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
                <small>{pct}% du budget d’heures consommé</small>
              </button>
            );
          })}
        </div>
        {z ? <div className="panel zone-detail">
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
                    background: colors[
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
              <b>{consumption}%</b>
              <span>{done} h réalisées</span>
            </div>
            <div>
              <small>RESTANT</small>
              <b>{budget - done} h</b>
              <span>budget disponible</span>
            </div>
          </div>
          <div className="zone-task-title">
            <div>
              <b>Types de travail alloués</b>
              <span>{tasksForZone.length} allocation{tasksForZone.length > 1 ? "s" : ""}</span>
            </div>
            <button className="primary" onClick={() => { setEditingAllocation(null); setAllocationTaskId(""); setShowAllocation(true); }}>
              ＋ Allouer un budget
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
                    <i style={{ width: `${Math.min(p, 100)}%`, background: colors[0] }} />
                  </div>
                  <div className="allocation-actions">
                    <button onClick={() => { const allocation = allocations.find((a) => a.id === t.allocationId) ?? null; setEditingAllocation(allocation); setAllocationTaskId(allocation?.task_id ?? ""); setShowAllocation(true); }}>Modifier</button>
                    <button disabled={saving} onClick={() => { const allocation = allocations.find((a) => a.id === t.allocationId); if (allocation) void deleteAllocation(allocation); }}>Supprimer</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div> : (
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
                type="button"
                onClick={() => {
                  setShowZone(false);
                  setEditingZone(null);
                }}
              >
                ×
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
      {showAllocation && z && (() => {
        const selectedTaskId = editingAllocation?.task_id ?? allocationTaskId;
        const selectedTask = zoneTasks.find((task) => task.id === selectedTaskId);
        const allocatedToOtherZones = selectedTask
          ? allocations.filter((item) => item.task_id === selectedTask.id && item.id !== editingAllocation?.id).reduce((sum, item) => sum + item.allocated_hours, 0)
          : 0;
        return (
          <div className="modal-backdrop">
            <form className="task-modal" onSubmit={saveAllocation}>
              <div className="modal-title">
                <div>
                  <span>BUDGET DE ZONE · {z.code}</span>
                  <h3>{editingAllocation ? "Modifier l’allocation" : "Allouer un type de travail"}</h3>
                </div>
                <button type="button" onClick={() => { setShowAllocation(false); setEditingAllocation(null); setError(""); }}>×</button>
              </div>
              <label>
                Type de tâche
                <select name="taskId" required value={selectedTaskId} disabled={Boolean(editingAllocation)} onChange={(event) => setAllocationTaskId(event.target.value)}>
                  <option value="">Sélectionner…</option>
                  {zoneTasks.map((task) => {
                    const allocated = allocations.filter((item) => item.task_id === task.id && item.id !== editingAllocation?.id).reduce((sum, item) => sum + item.allocated_hours, 0);
                    const available = Number(task.budget_hours) - allocated;
                    const alreadyInZone = allocations.some((item) => item.zone_id === z.id && item.task_id === task.id && item.id !== editingAllocation?.id);
                    return <option key={task.id} value={task.id} disabled={alreadyInZone || available <= 0}>{task.code} · {task.name} — {available.toLocaleString("fr-FR")} h disponibles</option>;
                  })}
                </select>
                {editingAllocation && <input type="hidden" name="taskId" value={editingAllocation.task_id} />}
              </label>
              {selectedTask && (
                <div className="budget-availability">
                  Budget global : <b>{Number(selectedTask.budget_hours).toLocaleString("fr-FR")} h</b> · Déjà alloué ailleurs : <b>{allocatedToOtherZones.toLocaleString("fr-FR")} h</b>
                </div>
              )}
              <label>
                Heures allouées à {z.code}
                <input name="allocatedHours" type="number" min="0.25" step="0.25" required defaultValue={editingAllocation?.allocated_hours ?? ""} />
              </label>
              {error && <div className="settings-error">{error}</div>}
              <div className="modal-actions">
                <button type="button" onClick={() => { setShowAllocation(false); setEditingAllocation(null); setError(""); }}>Annuler</button>
                <button className="primary" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer l’allocation"}</button>
              </div>
            </form>
          </div>
        );
      })()}
    </div>
  );
}

function Stock({
  toast,
  accessToken,
}: {
  toast: (s: string) => void;
  accessToken: string;
}) {
  const [mode, setMode] = useState<"sortie" | "entree">("sortie");
  const [item, setItem] = useState(0);
  const [qty, setQty] = useState("20");
  const [recorded, setRecorded] = useState(false);
  const movements = [
    {
      time: "15:36",
      type: "Sortie",
      article: "Rail supportage 41×41 · 3 m",
      qty: "− 12 u",
      detail: "Équipier 03 · Atelier production",
      author: "Gestionnaire Démo",
    },
    {
      time: "13:12",
      type: "Entrée",
      article: "Chemin de câble 300×60",
      qty: "+ 80 ml",
      detail: "Réception fournisseur · Rack B-01",
      author: "Gestionnaire Démo",
    },
    {
      time: "10:24",
      type: "Sortie",
      article: "Câble U1000 R2V 4G25",
      qty: "− 64 m",
      detail: "Équipier 01 · Local électrique",
      author: "Gestionnaire Démo",
    },
    {
      time: "08:48",
      type: "Entrée",
      article: "Luminaire LED étanche 48 W",
      qty: "+ 40 u",
      detail: "Réception fournisseur · Magasin C-04",
      author: "Gestionnaire Démo",
    },
  ];
  return (
    <div className="content page-content">
      <div className="page-head">
        <div>
          <h2>Suivi de stock</h2>
          <p>
            Commandes, réceptions et consommations de matériel sur le chantier.
          </p>
        </div>
        <div className="stock-actions">
          <button onClick={() => setMode("entree")}>
            ↓ Enregistrer une entrée
          </button>
          <button className="primary" onClick={() => setMode("sortie")}>
            ↑ Enregistrer une sortie
          </button>
        </div>
      </div>
      <div className="stock-kpis">
        <Kpi
          label="ARTICLES SUIVIS"
          value="126"
          detail="6 familles de matériel"
          tone="green"
        />
        <Kpi
          label="COMMANDÉ"
          value="78 420 €"
          detail="92% réceptionné"
          tone="blue"
          progress={92}
        />
        <Kpi
          label="ALERTES STOCK"
          value="2"
          detail="Rail 41×41 · Boulonnerie M8"
          tone="red"
        />
        <Kpi
          label="MOUVEMENTS DU JOUR"
          value="18"
          detail="6 entrées · 12 sorties"
          tone="gold"
        />
      </div>
      <div className="stock-layout">
        <div className="panel stock-table">
          <div className="panel-title">
            <div>
              <span>ÉTAT DU STOCK</span>
              <h3>Matériel disponible</h3>
            </div>
            <button>Exporter →</button>
          </div>
          <div className="filters">
            <input placeholder="⌕  Rechercher un article…" />
            <button>Toutes les familles⌄</button>
            <button>Tous les états⌄</button>
          </div>
          <div className="stock-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ARTICLE</th>
                  <th>COMMANDÉ / REÇU</th>
                  <th>DISPONIBLE</th>
                  <th>EMPLACEMENT</th>
                  <th>ÉTAT</th>
                </tr>
              </thead>
              <tbody>
                {stockItems.map((s, i) => (
                  <tr
                    key={s.ref}
                    onClick={() => setItem(i)}
                    className={item === i ? "stock-selected" : ""}
                  >
                    <td>
                      <b>{s.name}</b>
                      <small>
                        {s.ref} · {s.category}
                      </small>
                    </td>
                    <td>
                      <b>
                        {s.ordered} / {s.received} {s.unit}
                      </b>
                      <div className="bar">
                        <i
                          style={{
                            width: `${(s.received / s.ordered) * 100}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td>
                      <strong>
                        {s.stock} {s.unit}
                      </strong>
                      <small>
                        Seuil : {s.min} {s.unit}
                      </small>
                    </td>
                    <td>{s.location}</td>
                    <td>
                      <span
                        className={s.stock < s.min ? "stock-alert" : "stock-ok"}
                      >
                        ● {s.stock < s.min ? "À commander" : "Disponible"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel movement-form">
          <div className="movement-tabs">
            <button
              className={mode === "sortie" ? "active" : ""}
              onClick={() => setMode("sortie")}
            >
              ↑ Sortie
            </button>
            <button
              className={mode === "entree" ? "active" : ""}
              onClick={() => setMode("entree")}
            >
              ↓ Entrée
            </button>
          </div>
          <div className="movement-body">
            <span>NOUVEAU MOUVEMENT</span>
            <h3>
              {mode === "sortie" ? "Sortie de matériel" : "Entrée en stock"}
            </h3>
            <label>
              Article
              <select
                value={item}
                onChange={(e) => setItem(Number(e.target.value))}
              >
                {stockItems.map((s, i) => (
                  <option key={s.ref} value={i}>
                    {s.ref} · {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="available">
              Stock actuel{" "}
              <b>
                {stockItems[item].stock} {stockItems[item].unit}
              </b>
            </div>
            <label>
              Quantité
              <input
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <small>{stockItems[item].unit}</small>
            </label>
            {mode === "sortie" ? (
              <>
                <label>
                  Personne
                  <select>
                    <option>Équipier 01</option>
                    <option>Équipier 03</option>
                    <option>Équipier 04</option>
                  </select>
                </label>
                <label>
                  Zone d’affectation
                  <select>
                    {zones.map((z) => (
                      <option key={z.code}>{z.name}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label>
                Zone de stockage
                <select>
                  <option>Magasin principal</option>
                  <option>Rack B-01</option>
                  <option>Zone extérieure</option>
                  <option>Container matériel</option>
                </select>
              </label>
            )}
            <label>
              Référence / commentaire
              <input
                placeholder={
                  mode === "sortie"
                    ? "Bon de sortie, précision…"
                    : "BL fournisseur, commande…"
                }
              />
            </label>
            <button
              className="save"
              onClick={async () => {
                const response = await fetch("/api/operations", {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${accessToken}`,
                  },
                  body: JSON.stringify({
                    kind: "stock",
                    movementType: mode,
                    articleRef: stockItems[item].ref,
                    quantity: Number(qty),
                    personName: mode === "sortie" ? "Équipier 01" : null,
                    zoneName:
                      mode === "sortie" ? zones[0].name : "Magasin principal",
                  }),
                });
                if (response.ok) {
                  setRecorded(true);
                  toast(
                    `${mode === "sortie" ? "Sortie" : "Entrée"} de stock enregistrée et tracée`,
                  );
                } else toast("Le mouvement n’a pas pu être enregistré");
              }}
            >
              {recorded ? "✓ Mouvement enregistré" : "Valider le mouvement"}
            </button>
          </div>
        </div>
      </div>
      <div className="panel movement-history">
        <div className="panel-title">
          <div>
            <span>JOURNAL DES MOUVEMENTS</span>
            <h3>Dernières opérations</h3>
          </div>
          <button>Voir tout l’historique →</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>HEURE</th>
              <th>TYPE</th>
              <th>ARTICLE</th>
              <th>QUANTITÉ</th>
              <th>AFFECTATION / STOCKAGE</th>
              <th>SAISI PAR</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.time}>
                <td>{m.time}</td>
                <td>
                  <span
                    className={m.type === "Entrée" ? "move-in" : "move-out"}
                  >
                    {m.type === "Entrée" ? "↓" : "↑"} {m.type}
                  </span>
                </td>
                <td>
                  <b>{m.article}</b>
                </td>
                <td>
                  <strong>{m.qty}</strong>
                </td>
                <td>{m.detail}</td>
                <td>{m.author}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cables({ toast }: { toast: (s: string) => void }) {
  const [imported, setImported] = useState(false);
  return (
    <div className="content page-content">
      <div className="page-head">
        <div>
          <h2>Carnet de câbles</h2>
          <p>
            Importez, contrôlez et suivez les tirages fournis par le client.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setImported(true);
            toast("Import terminé : 142 lignes reconnues");
          }}
        >
          ⇧ Importer un fichier Excel
        </button>
      </div>
      {imported && (
        <div className="import-success">
          ✓{" "}
          <div>
            <b>carnet_cables_client_v4.xlsx importé</b>
            <small>
              142 lignes reconnues · 3 doublons ignorés · il y a quelques
              secondes
            </small>
          </div>
          <button>Voir le rapport</button>
        </div>
      )}
      <div className="cable-kpis">
        <Kpi
          label="TOTAL CÂBLES"
          value="328"
          detail="24 680 m cumulés"
          tone="blue"
        />
        <Kpi
          label="À TIRER"
          value="146"
          detail="10 420 m restants"
          tone="gold"
        />
        <Kpi label="TIRÉS" value="124" detail="38% du carnet" tone="green" />
        <Kpi
          label="RACCORDÉS"
          value="58"
          detail="18% du carnet"
          tone="purple"
        />
      </div>
      <div className="panel data-panel">
        <div className="filters">
          <input placeholder="⌕  Repère, origine, destination…" />
          <button>État du câble⌄</button>
          <button>Type de câble⌄</button>
          <em>328 résultats</em>
        </div>
        <table>
          <thead>
            <tr>
              <th>REPÈRE</th>
              <th>ORIGINE</th>
              <th>DESTINATION</th>
              <th>TYPE</th>
              <th>LONGUEUR</th>
              <th>ÉTAT</th>
            </tr>
          </thead>
          <tbody>
            {cables.map((c) => (
              <tr key={c[0]}>
                {c.slice(0, 5).map((v, i) => (
                  <td key={v}>
                    <b>{i === 0 ? v : null}</b>
                    {i !== 0 ? v : null}
                  </td>
                ))}
                <td>
                  <span
                    className={`state ${c[5].replace("À ", "").toLowerCase()}`}
                  >
                    ● {c[5]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type KpiProps = {
  label: string;
  value: string;
  detail: string;
  tone: string;
  ring?: number;
  progress?: number;
  avatars?: boolean;
};

function Kpi({ label, value, detail, tone, ring, progress, avatars }: KpiProps) {
  return (
    <div className={`kpi ${tone}`}>
      <span>{label}</span>
      <div className="kpi-main">
        <div>
          <b>{value}</b>
          <small>{detail}</small>
        </div>
        {ring && (
          <div
            className="ring"
            style={{
              background: `conic-gradient(#2d7f65 ${ring}%, #e7ebe9 0)`,
            }}
          >
            <i>{ring}</i>
          </div>
        )}
      </div>
      {progress && (
        <div className="bar">
          <i style={{ width: `${progress}%` }} />
        </div>
      )}
      {avatars && (
        <div className="avatars">
          <i>JM</i>
          <i>SB</i>
          <i>ML</i>
          <i>+9</i>
        </div>
      )}
    </div>
  );
}
