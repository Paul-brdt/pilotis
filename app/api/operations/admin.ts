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
    } else if (["agency-create", "agency-update", "qualification-create", "qualification-active", "timesheet-generate", "timesheet-status"].includes(String(body.kind))) {
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
        const { error } = await db.from("qualifications").insert({ project_id: project.id, name });
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
        const [{ data: people }, { data: entries }, { data: projectDetails }] = await Promise.all([
          db.from("people").select("id,full_name,qualification,coefficient").eq("project_id", project.id).eq("agency_id", agencyId).eq("contract_type", "interimaire").order("full_name"),
          db.from("time_entries").select("person_id,work_date,hours").eq("project_id", project.id).gte("work_date", weekStart).lte("work_date", weekEnd),
          db.from("projects").select("name,code,location").eq("id", project.id).single(),
        ]);
        const workers = (people ?? []).map((person) => {
          const hours = days.map((day) => (entries ?? []).filter((entry) => entry.person_id === person.id && entry.work_date === day.date).reduce((sum, entry) => sum + Number(entry.hours), 0));
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
    } else if (body.kind === "stock") {
      const [{ data: item }, { data: person }, { data: zone }] = await Promise.all([
        db.from("stock_items").select("id").eq("project_id", project.id).eq("reference", String(body.articleRef)).single(),
        body.personName ? db.from("people").select("id").eq("project_id", project.id).eq("full_name", String(body.personName)).maybeSingle() : Promise.resolve({ data: null }),
        db.from("zones").select("id").eq("project_id", project.id).eq("name", String(body.zoneName)).maybeSingle(),
      ]);
      const quantity = Number(body.quantity);
      if (!item || !["entree", "sortie"].includes(String(body.movementType)) || !Number.isFinite(quantity) || quantity <= 0) return Response.json({ error: "Mouvement invalide" }, { status: 400 });
      const { error } = await db.from("stock_movements").insert({ project_id: project.id, stock_item_id: item.id, movement_type: body.movementType, quantity, person_id: person?.id, zone_id: zone?.id, storage_zone: body.movementType === "entree" ? String(body.zoneName || "Magasin principal") : null, created_by: user.id });
      if (error) throw error;
    } else return Response.json({ error: "Type inconnu" }, { status: 400 });

    await db.from("audit_events").insert({ project_id: project.id, action: String(body.kind), entity_type: String(body.kind), payload: body, actor_id: user.id });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erreur" }, { status: 500 }); }
}
