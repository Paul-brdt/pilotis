export type View =
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

export type CurrentProfile = {
  id: string;
  full_name: string | null;
  role: string;
};

export type ProjectIdentity = {
  id: string;
  code: string;
  name: string;
  location: string | null;
};

export type PersonRow = {
  id: string;
  full_name: string;
  qualification: string | null;
  contract_type: "interne" | "interimaire";
  coefficient: string | null;
  active: boolean;
  agency_id: string | null;
  agencies?: { name: string } | null;
};

export type AgencyRow = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
};

export type QualificationRow = { id: string; name: string; active: boolean };

export const accessLevels = [
  ["administrateur", "Administrateur"],
  ["bureau", "Bureau / chargé d’affaires"],
  ["conducteur", "Conducteur de travaux"],
  ["chef_chantier", "Chef de chantier"],
  ["magasinier", "Magasinier"],
  ["consultation", "Consultation"],
] as const;

export function roleLabel(role?: string | null) {
  return (
    accessLevels.find(([value]) => value === role)?.[1] ?? "Profil utilisateur"
  );
}

// Accounts created without a real mailbox (like "admin") live under this
// domain, so users can sign in with the short identifier.
const INTERNAL_LOGIN_DOMAIN = "pilotis.internal";

export function loginEmail(identifier: string) {
  const value = identifier.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${INTERNAL_LOGIN_DOMAIN}`;
}

export function loginLabel(email: string) {
  return email.endsWith(`@${INTERNAL_LOGIN_DOMAIN}`)
    ? email.slice(0, -INTERNAL_LOGIN_DOMAIN.length - 1)
    : email;
}

const allViews: View[] = [
  "dashboard",
  "presence",
  "pointage",
  "equipes",
  "interim",
  "taches",
  "zones",
  "stock",
  "engins",
  "outillage",
  "acces",
  "cables",
  "travaux-supplementaires",
  "settings",
];

const magasinViews: View[] = ["stock", "engins", "outillage", "acces"];

// Screens each role can open. The API and Supabase policies still enforce
// write access; this only keeps people away from screens they cannot use.
const roleViews: Record<string, View[]> = {
  administrateur: allViews,
  bureau: allViews,
  conducteur: allViews,
  chef_chantier: allViews.filter(
    (view) => view !== "interim" && view !== "settings",
  ),
  magasinier: ["dashboard", ...magasinViews],
  consultation: [
    "dashboard",
    "taches",
    "zones",
    "cables",
    "travaux-supplementaires",
    ...magasinViews,
  ],
};

export function canAccessView(role: string | null | undefined, view: View) {
  return (roleViews[role ?? ""] ?? ["dashboard"]).includes(view);
}
