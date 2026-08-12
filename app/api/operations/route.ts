import { createClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase";
import { isoWeekNumber, type TimesheetSnapshot } from "@/lib/timesheet";

export const dynamic = "force-dynamic";

function supabase(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) throw new Error("Authentification requise");
  return createClient(supabaseUrl, supabasePublishableKey, { global: { headers: { Authorization: authorization } } });
}

export async function GET(request: Request) {
  try {
    const db = supabase(request);
    const [timeEntries, stockMovements] = await Promise.all([
      db.from("time_entries").select("*").order("created_at", { ascending: false }).limit(25),
      db.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(25),
    ]);
    return Response.json({ timeEntries: timeEntries.data ?? [], stockMovements: stockMovements.data ?? [] });
  } catch { return Response.json({ error: "Authentification requise" }, { status: 401 }); }
}

export async function POST(request: Request) {
  try {
    const db = supabase(request);
    const { data: { user } } = await db.auth.getUser();
    if (!user) return Response.json({ error: "Authentification requise" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const { data: project } = await db.from("projects").select("id").eq("code", "24-018").single();
    if (!project) throw new Error("Chantier introuvable");

    if (body.kind === "person-create" || body.kind === "person-update" || body.kind === "person-active") {
      const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || !["administrateur", "bureau", "conducteur"].includes(profile.role)) return Response.json({ error: "Vous n’êtes pas autorisé à gérer les équipes." }, { status: 403 });
      const personId = String(body.personId ?? "");
      if (body.kind === "person-active") {
        const { error } = await db.from("people").update({ active: Boolean(body.active) }).eq("id", personId).eq("project_id", project.id);
        if (error) throw error;
      } else {
        const fullName = String(body.fullName ?? "").trim();
        const qualification = String(body.qualification ?? "").trim() || null;
        const contractType = String(body.contractType ?? "");
        const coefficient = String(body.coefficient ?? "").trim() || null;
        const agencyId = String(body.agencyId ?? "").trim() || null;
        if (!fullName || !["interne", "interimaire"].includes(contractType)) return Response.json({ error: "Collaborateur invalide" }, { status: 400 });
        if (!qualification) return Response.json({ error: "Sélectionnez une qualification." }, { status: 400 });
        const [{ data: validQualification }, { data: validAgency }] = await Promise.all([
          db.from("qualifications").select("id").eq("project_id", project.id).eq("name", qualification).eq("active", true).maybeSingle(),
          agencyId ? db.from("agencies").select("id").eq("id", agencyId).eq("project_id", project.id).eq("active", true).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        if (!validQualification) return Response.json({ error: "La qualification sélectionnée n’est pas disponible." }, { status: 400 });
        if (contractType === "interimaire" && !validAgency) return Response.json({ error: "Sélectionnez une agence d’intérim existante." }, { status: 400 });
        const values = { full_name: fullName, qualification, contract_type: contractType, coefficient, agency_id: contractType === "interimaire" ? agencyId : null };
        const result = body.kind === "person-create"
          ? await db.from("people").insert({ ...values, project_id: project.id })
          : await db.from("people").update(values).eq("id", personId).eq("project_id", project.id);
        if (result.error) throw result.error;
      }
    } else if (["agency-create", "agency-update", "qualification-create", "qualification-update", "qualification-delete", "qualification-active", "timesheet-generate", "timesheet-status"].includes(String(body.kind))) {
      const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || !["administrateur", "bureau", "conducteur"].includes(profile.role)) return Response.json({ error: "Vous n’êtes pas autorisé à gérer l’intérim." }, { status: 403 });
      if (body.kind === "agency-create" || body.kind === "agency-update") {
        const name = String(body.name ?? "").trim();
        const code = String(body.code ?? "").trim().toUpperCase();
        const email = String(body.email ?? "").trim() || null;
        if (!name || !code) return Response.json({ error: "Le nom et le code de l’agence sont obligatoires." }, { status: 400 });
        const values = { project_id: project.id, name, code, address: String(body.address ?? "").trim() || null, postal_code: String(body.postalCode ?? "").trim() || null, city: String(body.city ?? "").trim() || null, contact_name: String(body.contactName ?? "").trim() || null, phone: String(body.phone ?? "").trim() || null, email, active: Boolean(body.active ?? true) };
        const result = body.kind === "agency-create"
          ? await db.from("agencies").insert(values)
          : await db.from("agencies").update(values).eq("id", String(body.agencyId ?? "")).eq("project_id", project.id);
        if (result.error) throw result.error;
      } else if (body.kind === "qualification-create") {
        const name = String(body.name ?? "").trim();
        if (!name) return Response.json({ error: "Le nom de la qualification est obligatoire." }, { status: 400 });
        const { data: duplicate } = await db.from("qualifications").select("id").eq("project_id", project.id).ilike("name", name).maybeSingle();
        if (duplicate) return Response.json({ error: "Cette qualification existe déjà." }, { status: 409 });
        const { error } = await db.from("qualifications").insert({ project_id: project.id, name });
        if (error) throw error;
      } else if (body.kind === "qualification-update") {
        const qualificationId = String(body.qualificationId ?? "");
        const name = String(body.name ?? "").trim();
        if (!qualificationId || !name) return Response.json({ error: "Qualification invalide." }, { status: 400 });
        const [{ data: qualification }, { data: duplicate }] = await Promise.all([
          db.from("qualifications").select("id,name").eq("id", qualificationId).eq("project_id", project.id).maybeSingle(),
          db.from("qualifications").select("id").eq("project_id", project.id).ilike("name", name).neq("id", qualificationId).maybeSingle(),
        ]);
        if (!qualification) return Response.json({ error: "Qualification introuvable." }, { status: 404 });
        if (duplicate) return Response.json({ error: "Cette qualification existe déjà." }, { status: 409 });
        const { error: qualificationError } = await db.from("qualifications").update({ name }).eq("id", qualificationId).eq("project_id", project.id);
        if (qualificationError) throw qualificationError;
        const { error: peopleError } = await db.from("people").update({ qualification: name }).eq("project_id", project.id).eq("qualification", qualification.name);
        if (peopleError) {
          await db.from("qualifications").update({ name: qualification.name }).eq("id", qualificationId).eq("project_id", project.id);
          throw peopleError;
        }
      } else if (body.kind === "qualification-delete") {
        const qualificationId = String(body.qualificationId ?? "");
        const { data: qualification } = await db.from("qualifications").select("id,name").eq("id", qualificationId).eq("project_id", project.id).maybeSingle();
        if (!qualification) return Response.json({ error: "Qualification introuvable." }, { status: 404 });
        const { count } = await db.from("people").select("id", { count: "exact", head: true }).eq("project_id", project.id).eq("qualification", qualification.name);
        if ((count ?? 0) > 0) return Response.json({ error: `Impossible de supprimer cette qualification : elle est utilisée par ${count} personne(s). Modifiez d’abord leurs fiches.` }, { status: 409 });
        const { error } = await db.from("qualifications").delete().eq("id", qualificationId).eq("project_id", project.id);
        if (error) throw error;
      } else if (body.kind === "qualification-active") {
        const { error } = await db.from("qualifications").update({ active: Boolean(body.active) }).eq("id", String(body.qualificationId ?? "")).eq("project_id", project.id);
        if (error) throw error;
      } else if (body.kind === "timesheet-generate") {
        const agencyId = String(body.agencyId ?? "");
        const weekStart = String(body.weekStart ?? "");
        if (!agencyId || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return Response.json({ error: "Semaine ou agence invalide." }, { status: 400 });
        const { data: agency } = await db.from("agencies").select("id,name,code,address,postal_code,city").eq("id", agencyId).eq("project_id", project.id).maybeSingle();
        if (!agency) return Response.json({ error: "Agence introuvable." }, { status: 404 });
        const monday = new Date(`${weekStart}T12:00:00Z`);
        const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setUTCDate(monday.getUTCDate() + index); return { date: date.toISOString().slice(0, 10), label: date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", timeZone: "UTC" }).toUpperCase() }; });
        const weekEnd = days[6].date;
        const [{ data: people }, { data: attendance }, { data: projectDetails }] = await Promise.all([
          db.from("people").select("id,full_name,qualification,coefficient").eq("project_id", project.id).eq("agency_id", agencyId).eq("contract_type", "interimaire").order("full_name"),
          db.from("daily_attendance").select("person_id,work_date,status,regular_hours,automatic_overtime_hours,manual_overtime_hours").eq("project_id", project.id).gte("work_date", weekStart).lte("work_date", weekEnd),
          db.from("projects").select("name,code,location").eq("id", project.id).single(),
        ]);
        const workers = (people ?? []).map((person) => {
          const hours = days.map((day) => (attendance ?? []).filter((row) => row.person_id === person.id && row.work_date === day.date && row.status === "present").reduce((sum, row) => sum + Number(row.regular_hours) + Number(row.manual_overtime_hours ?? row.automatic_overtime_hours), 0));
          return { id: person.id, name: person.full_name, qualification: person.qualification, coefficient: person.coefficient, hours, total: hours.reduce((sum, value) => sum + value, 0), meals: hours.filter((value) => value > 5).length };
        });
        const snapshot: TimesheetSnapshot = {
          version: 1, weekNumber: isoWeekNumber(monday), weekStart, weekEnd,
          agency: { name: agency.name, code: agency.code, address: agency.address, postalCode: agency.postal_code, city: agency.city },
          project: { name: projectDetails?.name ?? "Chantier", code: projectDetails?.code ?? "24-018", location: projectDetails?.location ?? null },
          days, workers,
          totalHours: workers.reduce((sum, worker) => sum + worker.total, 0),
          totalMeals: workers.reduce((sum, worker) => sum + worker.meals, 0),
        };
        const now = new Date().toISOString();
        const { error } = await db.from("weekly_timesheets").upsert({ project_id: project.id, agency_id: agencyId, week_start: weekStart, status: "generated", generated_by: user.id, generated_at: now, updated_at: now, snapshot }, { onConflict: "project_id,agency_id,week_start" });
        if (error) throw error;
      } else {
        const agencyId = String(body.agencyId ?? "");
        const weekStart = String(body.weekStart ?? "");
        const { data: sheet } = await db.from("weekly_timesheets").select("id,status").eq("project_id", project.id).eq("agency_id", agencyId).eq("week_start", weekStart).maybeSingle();
        if (!sheet) return Response.json({ error: "Générez d’abord la feuille." }, { status: 404 });
        const nextStatus = sheet.status === "generated" && ["administrateur", "conducteur"].includes(profile.role) ? "conducteur_validated" : sheet.status === "conducteur_validated" && ["administrateur", "bureau"].includes(profile.role) ? "bureau_validated" : null;
        if (!nextStatus) return Response.json({ error: "Cette validation n’est pas autorisée à cette étape." }, { status: 403 });
        const { error } = await db.from("weekly_timesheets").update({ status: nextStatus }).eq("id", sheet.id);
        if (error) throw error;
      }
    } else if (body.kind === "task-create" || body.kind === "task-update") {
      const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || !["administrateur", "bureau", "conducteur"].includes(profile.role)) return Response.json({ error: "Vous n’êtes pas autorisé à gérer les tâches." }, { status: 403 });
      const code = String(body.code ?? "").trim().toUpperCase();
      const name = String(body.name ?? "").trim();
      const budgetHours = Number(body.budgetHours);
      if (!code || !name || !Number.isFinite(budgetHours) || budgetHours < 0) return Response.json({ error: "Tâche invalide" }, { status: 400 });
      if (body.kind === "task-create") {
        const { error } = await db.from("tasks").insert({ project_id: project.id, code, name, budget_hours: budgetHours });
        if (error) throw error;
      } else {
        const taskId = String(body.taskId ?? "");
        const { data: previous } = await db.from("tasks").select("id,budget_hours").eq("id", taskId).eq("project_id", project.id).maybeSingle();
        if (!previous) return Response.json({ error: "Tâche introuvable" }, { status: 404 });
        const budgetChanged = Number(previous.budget_hours) !== budgetHours;
        const reason = String(body.reason ?? "").trim();
        if (budgetChanged && !reason) return Response.json({ error: "Un motif est obligatoire pour modifier le budget." }, { status: 400 });
        const { data: allocatedRows } = await db.from("zone_task_budget_allocations").select("allocated_hours").eq("task_id", taskId);
        const allocatedHours = (allocatedRows ?? []).reduce((sum, row) => sum + Number(row.allocated_hours), 0);
        if (budgetHours < allocatedHours) return Response.json({ error: `Le budget ne peut pas être inférieur aux ${allocatedHours} h déjà allouées aux zones.` }, { status: 400 });
        const { error } = await db.from("tasks").update({ code, name, budget_hours: budgetHours }).eq("id", taskId);
        if (error) throw error;
        if (budgetChanged) {
          const { error: revisionError } = await db.from("task_budget_revisions").insert({ task_id: taskId, previous_budget_hours: previous.budget_hours, revised_budget_hours: budgetHours, reason, revised_by: user.id });
          if (revisionError) throw revisionError;
        }
      }

    } else if (body.kind === "project-settings" || body.kind === "zone-create" || body.kind === "zone-update" || body.kind === "zone-allocation-save" || body.kind === "zone-allocation-delete") {
      const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || !["administrateur", "bureau", "conducteur"].includes(profile.role)) return Response.json({ error: "Vous n’êtes pas autorisé à modifier les paramètres." }, { status: 403 });
      if (body.kind === "zone-allocation-save" || body.kind === "zone-allocation-delete") {
        const zoneId = String(body.zoneId ?? "");
        const taskId = String(body.taskId ?? "");
        const allocationId = String(body.allocationId ?? "");
        const [{ data: zone }, { data: task }] = await Promise.all([
          db.from("zones").select("id").eq("id", zoneId).eq("project_id", project.id).maybeSingle(),
          db.from("tasks").select("id,budget_hours").eq("id", taskId).eq("project_id", project.id).maybeSingle(),
        ]);
        if (!zone || !task) return Response.json({ error: "Zone ou type de tâche invalide." }, { status: 400 });
        if (body.kind === "zone-allocation-delete") {
          const { error } = await db.from("zone_task_budget_allocations").delete().eq("id", allocationId).eq("project_id", project.id).eq("zone_id", zoneId).eq("task_id", taskId);
          if (error) throw error;
        } else {
          const allocatedHours = Number(body.allocatedHours);
          if (!Number.isFinite(allocatedHours) || allocatedHours <= 0) return Response.json({ error: "Le budget alloué doit être supérieur à 0 h." }, { status: 400 });
          const { data: existing } = await db.from("zone_task_budget_allocations").select("id").eq("zone_id", zoneId).eq("task_id", taskId).maybeSingle();
          const values = { project_id: project.id, zone_id: zoneId, task_id: taskId, allocated_hours: allocatedHours, created_by: user.id };
          const result = existing
            ? await db.from("zone_task_budget_allocations").update({ allocated_hours: allocatedHours }).eq("id", existing.id)
            : await db.from("zone_task_budget_allocations").insert(values);
          if (result.error) throw result.error;
        }
      } else if (body.kind === "project-settings") {
        const name = String(body.name ?? "").trim();
        const location = String(body.location ?? "").trim() || null;
        const contactName = String(body.contactName ?? "").trim() || null;
        const contactEmail = String(body.contactEmail ?? "").trim() || null;
        const contactPhone = String(body.contactPhone ?? "").trim() || null;
        const primaryColor = String(body.primaryColor ?? "").trim();
        const logoUrl = String(body.logoUrl ?? "").trim() || null;
        const sessionTimeoutMinutes = Number(body.sessionTimeoutMinutes ?? 30);
        if (!name || !/^#[0-9a-fA-F]{6}$/.test(primaryColor) || ![15, 30, 60].includes(sessionTimeoutMinutes)) return Response.json({ error: "Paramètres invalides" }, { status: 400 });
        if (logoUrl) { try { new URL(logoUrl); } catch { return Response.json({ error: "URL du logo invalide" }, { status: 400 }); } }
        const { error } = await db.from("projects").update({ name, location, contact_name: contactName, contact_email: contactEmail, contact_phone: contactPhone, primary_color: primaryColor, logo_url: logoUrl, session_timeout_minutes: sessionTimeoutMinutes }).eq("id", project.id);
        if (error) throw error;
      } else {
        const code = String(body.code ?? "").trim().toUpperCase();
        const name = String(body.name ?? "").trim();
        const physicalProgress = Number(body.physicalProgress);
        if (!code || !name || !Number.isFinite(physicalProgress) || physicalProgress < 0 || physicalProgress > 100) return Response.json({ error: "Zone invalide" }, { status: 400 });
        if (body.kind === "zone-create") {
          const { error } = await db.from("zones").insert({ project_id: project.id, code, name, physical_progress: physicalProgress });
          if (error) throw error;
        } else {
          const zoneId = String(body.zoneId ?? "");
          const { error } = await db.from("zones").update({ code, name, physical_progress: physicalProgress }).eq("id", zoneId).eq("project_id", project.id);
          if (error) throw error;
        }
      }
    } else if (body.kind === "time-bulk") {
      const personIds = Array.isArray(body.personIds) ? body.personIds.map(String).filter(Boolean) : [];
      const hours = Number(body.hours);
      const taskId = String(body.taskId ?? ""); const zoneId = String(body.zoneId ?? ""); const workDate = String(body.workDate ?? "");
      if (!personIds.length || !taskId || !zoneId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !Number.isFinite(hours) || hours <= 0 || hours > 24) return Response.json({ error: "Pointage invalide" }, { status: 400 });
      const [{ data: task }, { data: zone }, { data: activePeople }] = await Promise.all([
        db.from("tasks").select("id").eq("id", taskId).eq("project_id", project.id).maybeSingle(),
        db.from("zones").select("id").eq("id", zoneId).eq("project_id", project.id).maybeSingle(),
        db.from("people").select("id").eq("project_id", project.id).eq("active", true).in("id", personIds),
      ]);
      if (!task || !zone || (activePeople?.length ?? 0) !== personIds.length) return Response.json({ error: "Une personne, une tâche ou une zone n’est plus disponible." }, { status: 400 });
      const { error } = await db.from("time_entries").insert(personIds.map(personId => ({ project_id: project.id, person_id: personId, task_id: taskId, zone_id: zoneId, work_date: workDate, hours, comment: String(body.comment || ""), created_by: user.id })));
      if (error) throw error;
    } else if (["rental-agency-create", "rental-agency-active", "equipment-create", "equipment-update", "equipment-movement", "equipment-document", "equipment-warning-settings"].includes(String(body.kind))) {
      const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || !["administrateur", "bureau", "magasinier"].includes(profile.role)) return Response.json({ error: "Vous n’êtes pas autorisé à gérer le magasin." }, { status: 403 });
      if (body.kind === "rental-agency-create") {
        const name = String(body.name ?? "").trim();
        if (!name) return Response.json({ error: "Le nom du loueur est obligatoire." }, { status: 400 });
        const { error } = await db.from("rental_agencies").insert({ project_id: project.id, name, contact_name: String(body.contactName ?? "").trim() || null, phone: String(body.phone ?? "").trim() || null, email: String(body.email ?? "").trim() || null, created_by: user.id });
        if (error) { if (error.code === "23505") return Response.json({ error: "Cette agence existe déjà." }, { status: 409 }); throw error; }
      } else if (body.kind === "rental-agency-active") {
        const { error } = await db.from("rental_agencies").update({ active: Boolean(body.active) }).eq("project_id", project.id).eq("id", String(body.agencyId ?? ""));
        if (error) throw error;
      } else if (body.kind === "equipment-warning-settings") {
        const warningDays = Number(body.warningDays);
        if (!Number.isInteger(warningDays) || warningDays < 1 || warningDays > 365) return Response.json({ error: "Le délai doit être compris entre 1 et 365 jours." }, { status: 400 });
        const { error } = await db.from("projects").update({ vic_warning_days: warningDays }).eq("id", project.id);
        if (error) throw error;
      } else if (body.kind === "equipment-create" || body.kind === "equipment-update") {
        const category = String(body.category); const accessType = String(body.accessType || "") || null; const internalReference = String(body.internalReference ?? "").trim().toUpperCase(); const description = String(body.description ?? "").trim(); const status = String(body.status);
        const validStatuses = ["disponible", "affecte", "maintenance", "hors_service", "restitue"];
        if (!["engin", "outillage", "acces"].includes(category) || (category === "acces" && !["pirl", "echafaudage"].includes(String(accessType))) || (category !== "acces" && accessType) || !internalReference || !description || !validStatuses.includes(status)) return Response.json({ error: "Les informations du matériel sont invalides." }, { status: 400 });
        const date = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? String(value) : null;
        const rentalCost = body.rentalCost === null || body.rentalCost === "" ? null : Number(body.rentalCost);
        if (rentalCost !== null && (!Number.isFinite(rentalCost) || rentalCost < 0)) return Response.json({ error: "Le coût de location est invalide." }, { status: 400 });
        const values = { category, access_type: accessType, internal_reference: internalReference, rental_reference: String(body.rentalReference ?? "").trim() || null, rental_agency_id: String(body.rentalAgencyId ?? "") || null, brand: String(body.brand ?? "").trim() || null, description, serial_number: String(body.serialNumber ?? "").trim() || null, rental_start_date: date(body.rentalStartDate), rental_planned_end_date: date(body.rentalPlannedEndDate), rental_actual_end_date: date(body.rentalActualEndDate), rental_contract_number: String(body.rentalContractNumber ?? "").trim() || null, rental_cost: rentalCost, rental_cost_frequency: ["jour", "mois"].includes(String(body.rentalCostFrequency)) ? String(body.rentalCostFrequency) : null, vic_date: date(body.vicDate), vic_due_date: date(body.vicDueDate), status, stock_location_id: String(body.stockLocationId ?? "") || null, person_id: String(body.personId ?? "") || null, notes: String(body.notes ?? "").trim() || null, active: Boolean(body.active), updated_by: user.id, updated_at: new Date().toISOString() };
        const result = body.kind === "equipment-create" ? await db.from("equipment_assets").insert({ ...values, project_id: project.id, created_by: user.id }).select("id").single() : await db.from("equipment_assets").update(values).eq("project_id", project.id).eq("id", String(body.assetId ?? "")).select("id").single();
        if (result.error) { if (result.error.code === "23505") return Response.json({ error: "Cette référence interne existe déjà." }, { status: 409 }); throw result.error; }
        return Response.json({ ok: true, asset: result.data });
      } else if (body.kind === "equipment-movement") {
        const assetId = String(body.assetId ?? ""); const movementType = String(body.movementType);
        const nextStatus: Record<string, string> = { affectation: "affecte", retour: "disponible", transfert: "disponible", maintenance: "maintenance", remise_service: "disponible", restitution: "restitue" };
        if (!nextStatus[movementType]) return Response.json({ error: "Mouvement de matériel invalide." }, { status: 400 });
        const { data: asset } = await db.from("equipment_assets").select("id,category,status").eq("project_id", project.id).eq("id", assetId).maybeSingle();
        if (!asset) return Response.json({ error: "Matériel introuvable." }, { status: 404 });
        if (movementType === "affectation" && asset.status !== "disponible") return Response.json({ error: "Cet outil n’est plus disponible." }, { status: 409 });
        if (movementType === "retour" && asset.status !== "affecte") return Response.json({ error: "Cet outil n’est pas actuellement affecté." }, { status: 409 });
        const personId = String(body.personId ?? "") || null; const locationId = String(body.stockLocationId ?? "") || null; const zoneId = String(body.zoneId ?? "") || null;
        const [{ data: person }, { data: location }, { data: zone }] = await Promise.all([
          personId ? db.from("people").select("id").eq("project_id",project.id).eq("id",personId).eq("active",true).maybeSingle() : Promise.resolve({data:null}),
          locationId ? db.from("stock_locations").select("id").eq("project_id",project.id).eq("id",locationId).eq("active",true).maybeSingle() : Promise.resolve({data:null}),
          zoneId ? db.from("zones").select("id").eq("project_id",project.id).eq("id",zoneId).maybeSingle() : Promise.resolve({data:null}),
        ]);
        if (movementType === "affectation" && asset.category === "outillage" && !person) return Response.json({ error: "Sélectionnez une personne pour la sortie de l’outil." }, { status: 400 });
        if (["retour","transfert","remise_service"].includes(movementType) && !location) return Response.json({ error: "Sélectionnez un emplacement magasin." }, { status: 400 });
        const { error: movementError } = await db.from("equipment_movements").insert({ project_id: project.id, asset_id: assetId, movement_type: movementType, person_id: person?.id ?? null, stock_location_id: location?.id ?? null, zone_id: zone?.id ?? null, note: String(body.note ?? "").trim() || null, created_by: user.id });
        if (movementError) throw movementError;
        const { error } = await db.from("equipment_assets").update({ status: nextStatus[movementType], person_id: movementType === "affectation" ? person?.id ?? null : null, stock_location_id: movementType === "affectation" ? null : location?.id ?? null, rental_actual_end_date: movementType === "restitution" ? new Date().toISOString().slice(0, 10) : undefined, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", assetId);
        if (error) throw error;
      } else {
        const assetId = String(body.assetId ?? ""); const documentType = String(body.documentType); const storagePath = String(body.storagePath ?? ""); const fileName = String(body.fileName ?? "").trim();
        if (!["contrat_location", "rapport_vic", "rapport_verification", "photo", "autre"].includes(documentType) || !storagePath.startsWith(`${project.id}/${assetId}/`) || !fileName) return Response.json({ error: "Document invalide." }, { status: 400 });
        const { data: asset } = await db.from("equipment_assets").select("id").eq("project_id", project.id).eq("id", assetId).maybeSingle();
        if (!asset) return Response.json({ error: "Matériel introuvable." }, { status: 404 });
        const { error } = await db.from("equipment_documents").insert({ project_id: project.id, asset_id: assetId, document_type: documentType, file_name: fileName, storage_path: storagePath, uploaded_by: user.id });
        if (error) throw error;
      }
    } else if (body.kind === "extra-work-create" || body.kind === "extra-work-update") {
      const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || !["administrateur","bureau","conducteur","chef_chantier"].includes(profile.role)) return Response.json({ error: "Vous n’êtes pas autorisé à gérer les travaux supplémentaires." }, { status: 403 });
      const subject = String(body.subject ?? "").trim(); const hours = body.hours === null || body.hours === "" ? null : Number(body.hours); const materials = String(body.materials ?? "").trim() || null; const comments = String(body.comments ?? "").trim() || null;
      if (!subject || subject.length > 300 || (hours !== null && (!Number.isFinite(hours) || hours < 0))) return Response.json({ error: "L’objet est obligatoire et le volume d’heures doit être positif." }, { status: 400 });
      const values = { subject, hours, materials, comments, updated_by:user.id, updated_at:new Date().toISOString() };
      const result = body.kind === "extra-work-create"
        ? await db.from("extra_works").insert({...values,project_id:project.id,created_by:user.id}).select("id").single()
        : await db.from("extra_works").update(values).eq("project_id",project.id).eq("id",String(body.extraWorkId ?? "")).select("id").single();
      if (result.error) throw result.error;
      await db.from("audit_events").insert({project_id:project.id,action:String(body.kind),entity_type:"extra_work",entity_id:result.data.id,payload:{subject,hours,materials,comments},actor_id:user.id});
      return Response.json({ok:true,extraWork:result.data});
    } else if (body.kind === "stock-item-create" || body.kind === "stock-item-update") {
      const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || !["administrateur", "bureau", "magasinier"].includes(profile.role)) return Response.json({ error: "Vous n’êtes pas autorisé à gérer le catalogue de stock." }, { status: 403 });
      const reference = String(body.reference ?? "").trim().toUpperCase(); const name = String(body.name ?? "").trim(); const category = String(body.category ?? ""); const unit = String(body.unit ?? ""); const minimumQuantity = Number(body.minimumQuantity ?? 0);
      const validUnits = ["u", "m", "ml", "kg", "l", "boîte", "paquet"];
      const { data: validFamily } = await db.from("stock_families").select("id").eq("project_id", project.id).eq("name", category).eq("active", true).maybeSingle();
      if (!reference || !name || !validFamily || !validUnits.includes(unit) || !Number.isFinite(minimumQuantity) || minimumQuantity < 0) return Response.json({ error: "Les informations de l’article sont invalides." }, { status: 400 });
      const values = { reference, name, category, unit, minimum_quantity: minimumQuantity, active: Boolean(body.active ?? true) };
      const result = body.kind === "stock-item-create"
        ? await db.from("stock_items").insert({ ...values, project_id: project.id, ordered_quantity: 0, received_quantity: 0 }).select("id,reference").single()
        : await db.from("stock_items").update(values).eq("project_id", project.id).eq("id", String(body.stockItemId ?? "")).select("id,reference").single();
      const { data: item, error } = result;
      if (error) { if (error.code === "23505") return Response.json({ error: "Cette référence existe déjà." }, { status: 409 }); throw error; }
      await db.from("audit_events").insert({ project_id: project.id, action: "stock-item-create", entity_type: "stock_item", entity_id: item.id, payload: { reference, name, category, unit, minimumQuantity }, actor_id: user.id });
      return Response.json({ ok: true, item });
    } else if (["stock-location-create", "stock-location-update", "stock-location-delete"].includes(String(body.kind))) {
      const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || !["administrateur", "bureau", "magasinier"].includes(profile.role)) return Response.json({ error: "Vous n’êtes pas autorisé à gérer les emplacements." }, { status: 403 });
      const locationId = String(body.locationId ?? "");
      if (body.kind === "stock-location-delete") {
        const [{ count: sourceCount }, { count: destinationCount }, { count: assetCount }, { count: equipmentMovementCount }] = await Promise.all([
          db.from("stock_movements").select("id", { count:"exact", head:true }).eq("project_id",project.id).eq("source_location_id",locationId),
          db.from("stock_movements").select("id", { count:"exact", head:true }).eq("project_id",project.id).eq("destination_location_id",locationId),
          db.from("equipment_assets").select("id", { count:"exact", head:true }).eq("project_id",project.id).eq("stock_location_id",locationId),
          db.from("equipment_movements").select("id", { count:"exact", head:true }).eq("project_id",project.id).eq("stock_location_id",locationId),
        ]);
        if ((sourceCount??0)+(destinationCount??0)+(assetCount??0)+(equipmentMovementCount??0)>0) return Response.json({error:"Impossible de supprimer cet emplacement : il est utilisé par le stock ou son historique. Désactivez-le plutôt."},{status:409});
        const {error}=await db.from("stock_locations").delete().eq("project_id",project.id).eq("id",locationId); if(error)throw error;
        return Response.json({ok:true});
      }
      const name = String(body.name ?? "").trim(); const code = String(body.code ?? "").trim().toUpperCase() || null;
      if (!name) return Response.json({ error: "Le nom de l’emplacement est obligatoire." }, { status: 400 });
      const result=body.kind==="stock-location-create"?db.from("stock_locations").insert({project_id:project.id,name,code,created_by:user.id}):db.from("stock_locations").update({name,code,active:Boolean(body.active)}).eq("project_id",project.id).eq("id",locationId);
      const { data: location, error } = await result.select("id,name").single();
      if (error) { if (error.code === "23505") return Response.json({ error: "Cet emplacement existe déjà." }, { status: 409 }); throw error; }
      return Response.json({ ok: true, location });
    } else if (["stock-family-create", "stock-family-update", "stock-family-delete"].includes(String(body.kind))) {
      const {data:profile}=await db.from("profiles").select("role").eq("id",user.id).maybeSingle();
      if(!profile||!["administrateur","bureau","magasinier"].includes(profile.role))return Response.json({error:"Vous n’êtes pas autorisé à gérer les familles."},{status:403});
      const familyId=String(body.familyId??"");
      if(body.kind==="stock-family-delete"){
        const {data:stockFamily}=await db.from("stock_families").select("id,name").eq("project_id",project.id).eq("id",familyId).maybeSingle();
        if(!stockFamily)return Response.json({error:"Famille introuvable."},{status:404});
        const {count}=await db.from("stock_items").select("id",{count:"exact",head:true}).eq("project_id",project.id).eq("category",stockFamily.name);
        if((count??0)>0)return Response.json({error:`Impossible de supprimer cette famille : elle contient ${count} article(s). Modifiez d’abord leurs fiches.`},{status:409});
        const {error}=await db.from("stock_families").delete().eq("project_id",project.id).eq("id",familyId);if(error)throw error;return Response.json({ok:true});
      }
      const name=String(body.name??"").trim();if(!name)return Response.json({error:"Le nom de la famille est obligatoire."},{status:400});
      if(body.kind==="stock-family-create"){
        const {data,error}=await db.from("stock_families").insert({project_id:project.id,name,created_by:user.id}).select("id,name").single();if(error){if(error.code==="23505")return Response.json({error:"Cette famille existe déjà."},{status:409});throw error}return Response.json({ok:true,family:data});
      }
      const {data:stockFamily}=await db.from("stock_families").select("id,name").eq("project_id",project.id).eq("id",familyId).maybeSingle();if(!stockFamily)return Response.json({error:"Famille introuvable."},{status:404});
      const {error:updateError}=await db.from("stock_families").update({name,active:Boolean(body.active),updated_at:new Date().toISOString()}).eq("project_id",project.id).eq("id",familyId);if(updateError){if(updateError.code==="23505")return Response.json({error:"Cette famille existe déjà."},{status:409});throw updateError}
      const {error:itemError}=await db.from("stock_items").update({category:name}).eq("project_id",project.id).eq("category",stockFamily.name);if(itemError){await db.from("stock_families").update({name:stockFamily.name}).eq("id",familyId);throw itemError}return Response.json({ok:true});
    } else if (body.kind === "stock") {
      const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!profile || !["administrateur", "bureau", "magasinier"].includes(profile.role)) return Response.json({ error: "Vous n’êtes pas autorisé à enregistrer des mouvements de stock." }, { status: 403 });
      const movementType = String(body.movementType); const sourceLocationId = String(body.sourceLocationId ?? ""); const destinationLocationId = String(body.destinationLocationId ?? "");
      const [{ data: item }, { data: person }, { data: zone }, { data: source }, { data: destination }] = await Promise.all([
        db.from("stock_items").select("id").eq("project_id", project.id).eq("id", String(body.stockItemId ?? "")).eq("active", true).maybeSingle(),
        body.personId ? db.from("people").select("id").eq("project_id", project.id).eq("id", String(body.personId)).eq("active", true).maybeSingle() : Promise.resolve({ data: null }),
        body.zoneId ? db.from("zones").select("id").eq("project_id", project.id).eq("id", String(body.zoneId)).maybeSingle() : Promise.resolve({ data: null }),
        sourceLocationId ? db.from("stock_locations").select("id").eq("project_id", project.id).eq("id", sourceLocationId).eq("active", true).maybeSingle() : Promise.resolve({ data: null }),
        destinationLocationId ? db.from("stock_locations").select("id").eq("project_id", project.id).eq("id", destinationLocationId).eq("active", true).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const quantity = Number(body.quantity);
      if (!item || !["entree", "sortie", "transfert", "inventaire"].includes(movementType) || !Number.isFinite(quantity) || quantity < 0 || (movementType !== "inventaire" && quantity <= 0)) return Response.json({ error: "Mouvement invalide" }, { status: 400 });
      if (movementType === "entree" && !destination) return Response.json({ error: "Sélectionnez un emplacement de destination." }, { status: 400 });
      if (["sortie", "transfert", "inventaire"].includes(movementType) && !source) return Response.json({ error: "Sélectionnez un emplacement source." }, { status: 400 });
      if (movementType === "transfert" && (!destination || source?.id === destination.id)) return Response.json({ error: "Sélectionnez deux emplacements différents." }, { status: 400 });
      if (movementType === "sortie" && (!person || !zone)) return Response.json({ error: "Sélectionnez une personne et une zone d’affectation." }, { status: 400 });
      const note = String(body.note ?? "").trim() || null;
      const { data: existingMovements } = await db.from("stock_movements").select("movement_type,quantity,source_location_id,destination_location_id,inventory_delta").eq("project_id", project.id).eq("stock_item_id", item.id);
      const currentAtSource = (existingMovements ?? []).reduce((sum, movement) => {
        if (movement.movement_type === "entree" && movement.destination_location_id === source?.id) return sum + Number(movement.quantity);
        if (movement.movement_type === "sortie" && movement.source_location_id === source?.id) return sum - Number(movement.quantity);
        if (movement.movement_type === "transfert") return sum + (movement.destination_location_id === source?.id ? Number(movement.quantity) : 0) - (movement.source_location_id === source?.id ? Number(movement.quantity) : 0);
        if (movement.movement_type === "inventaire" && movement.source_location_id === source?.id) return sum + Number(movement.inventory_delta ?? 0);
        return sum;
      }, 0);
      if (["sortie", "transfert"].includes(movementType) && quantity > currentAtSource && !note) return Response.json({ error: "Une justification est obligatoire pour créer un stock négatif." }, { status: 400 });
      const inventoryDelta = movementType === "inventaire" ? quantity - currentAtSource : null;
      if (movementType === "inventaire" && (!note || inventoryDelta === 0)) return Response.json({ error: "L’inventaire doit corriger le stock et comporter un motif." }, { status: 400 });
      const { error } = await db.from("stock_movements").insert({ project_id: project.id, stock_item_id: item.id, movement_type: movementType, quantity: movementType === "inventaire" ? Math.abs(inventoryDelta as number) : quantity, source_location_id: source?.id ?? null, destination_location_id: destination?.id ?? null, inventory_delta: inventoryDelta, counted_quantity: movementType === "inventaire" ? quantity : null, previous_quantity: movementType === "inventaire" ? currentAtSource : null, person_id: person?.id ?? null, zone_id: zone?.id ?? null, note, created_by: user.id });
      if (error) throw error;
    } else return Response.json({ error: "Type inconnu" }, { status: 400 });

    await db.from("audit_events").insert({ project_id: project.id, action: String(body.kind), entity_type: String(body.kind), payload: body, actor_id: user.id });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erreur" }, { status: 500 }); }
}
