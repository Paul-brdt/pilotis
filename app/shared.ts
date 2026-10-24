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
