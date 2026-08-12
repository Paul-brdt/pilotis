import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase";
import { isoWeekNumber, type TimesheetSnapshot } from "@/lib/timesheet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const green = rgb(0.15, 0.38, 0.29);
const paleGreen = rgb(0.91, 0.96, 0.93);
const grid = rgb(0.68, 0.71, 0.69);
const ink = rgb(0.1, 0.12, 0.11);

function safeText(value: unknown) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
    .trim();
}

async function rebuildSnapshot(db: SupabaseClient, project: { id: string; name: string; code: string; location: string | null }, agencyId: string, weekStart: string) {
  const monday = new Date(`${weekStart}T12:00:00Z`);
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(monday); date.setUTCDate(monday.getUTCDate() + index); return { date: date.toISOString().slice(0, 10), label: date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", timeZone: "UTC" }).toUpperCase() }; });
  const weekEnd = days[6].date;
  const [{ data: agency }, { data: people }, { data: attendance }] = await Promise.all([
    db.from("agencies").select("name,code,address,postal_code,city").eq("id", agencyId).eq("project_id", project.id).maybeSingle(),
    db.from("people").select("id,full_name,qualification,coefficient").eq("project_id", project.id).eq("agency_id", agencyId).eq("contract_type", "interimaire").order("full_name"),
    db.from("daily_attendance").select("person_id,work_date,status,regular_hours,automatic_overtime_hours,manual_overtime_hours").eq("project_id", project.id).gte("work_date", weekStart).lte("work_date", weekEnd),
  ]);
  if (!agency) return null;
  const agencyRow = agency as { name: string; code: string; address: string | null; postal_code: string | null; city: string | null };
  const personRows = (people ?? []) as Array<{ id: string; full_name: string; qualification: string | null; coefficient: string | null }>;
  const attendanceRows = (attendance ?? []) as Array<{ person_id: string; work_date: string; status: string; regular_hours: number | string; automatic_overtime_hours: number | string; manual_overtime_hours: number | string | null }>;
  const workers = personRows.map((person) => { const hours = days.map((day) => attendanceRows.filter((row) => row.person_id === person.id && row.work_date === day.date && row.status === "present").reduce((sum, row) => sum + Number(row.regular_hours) + Number(row.manual_overtime_hours ?? row.automatic_overtime_hours), 0)); return { id: person.id, name: person.full_name, qualification: person.qualification, coefficient: person.coefficient ? Number(person.coefficient) : null, hours, total: hours.reduce((sum, value) => sum + value, 0), meals: hours.filter((value) => value > 5).length }; });
  return { version: 1, weekNumber: isoWeekNumber(monday), weekStart, weekEnd, agency: { name: agencyRow.name, code: agencyRow.code, address: agencyRow.address, postalCode: agencyRow.postal_code, city: agencyRow.city }, project: { name: project.name, code: project.code, location: project.location }, days, workers, totalHours: workers.reduce((sum, worker) => sum + worker.total, 0), totalMeals: workers.reduce((sum, worker) => sum + worker.meals, 0) } satisfies TimesheetSnapshot;
}

function drawCentered(page: PDFPage, font: PDFFont, text: string, x: number, y: number, width: number, size: number) {
  const printable = safeText(text);
  const measured = font.widthOfTextAtSize(printable, size);
  page.drawText(printable, { x: x + Math.max(3, (width - measured) / 2), y, size, font, color: ink, maxWidth: width - 6 });
}

function drawHeader(page: PDFPage, snapshot: TimesheetSnapshot, regular: PDFFont, bold: PDFFont, status: string, pageIndex: number, pageCount: number) {
  const width = A4_LANDSCAPE[0];
  page.drawRectangle({ x: 28, y: 520, width: width - 56, height: 50, color: green });
  page.drawText("FEUILLE DE POINTAGE HEBDOMADAIRE", { x: 44, y: 548, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`SEMAINE ${snapshot.weekNumber}  |  ${snapshot.weekStart} au ${snapshot.weekEnd}`, { x: 44, y: 531, size: 9.5, font: regular, color: rgb(1, 1, 1) });
  const project = `${safeText(snapshot.project.code)} - ${safeText(snapshot.project.name)}`;
  page.drawText(project, { x: 470, y: 549, size: 11, font: bold, color: rgb(1, 1, 1), maxWidth: 325 });
  page.drawText(safeText(snapshot.project.location), { x: 470, y: 532, size: 9, font: regular, color: rgb(1, 1, 1), maxWidth: 325 });

  page.drawRectangle({ x: 28, y: 474, width: width - 56, height: 36, borderColor: grid, borderWidth: 0.8, color: rgb(0.97, 0.98, 0.97) });
  page.drawText(`AGENCE : ${safeText(snapshot.agency.name)} (${safeText(snapshot.agency.code)})`, { x: 40, y: 492, size: 11, font: bold, color: ink });
  const address = [snapshot.agency.address, snapshot.agency.postalCode, snapshot.agency.city].filter(Boolean).join(" - ");
  page.drawText(safeText(address), { x: 40, y: 479, size: 8.5, font: regular, color: ink, maxWidth: 500 });
  page.drawText(`Statut : ${safeText(status)}  |  Page ${pageIndex}/${pageCount}`, { x: 590, y: 486, size: 8.5, font: regular, color: ink, maxWidth: 210 });
}

function drawTableHeader(page: PDFPage, snapshot: TimesheetSnapshot, bold: PDFFont, top: number) {
  const columns = [210, 60, 60, 60, 60, 60, 60, 60, 62, 62];
  const labels = ["INTERIMAIRE / QUALIFICATION", ...snapshot.days.map((day) => safeText(day.label)), "TOTAL", "PANIERS"];
  let x = 28;
  for (let index = 0; index < columns.length; index += 1) {
    page.drawRectangle({ x, y: top - 30, width: columns[index], height: 30, color: green, borderColor: rgb(1, 1, 1), borderWidth: 0.5 });
    drawCentered(page, bold, labels[index], x, top - 19, columns[index], index === 0 ? 8 : 7.5);
    x += columns[index];
  }
  return columns;
}

export function buildTimesheetPdf(snapshot: TimesheetSnapshot, status: string) {
  return PDFDocument.create().then(async (document) => {
    document.setTitle(`Feuille de pointage - ${snapshot.agency.name} - S${snapshot.weekNumber}`);
    document.setSubject(`Pointage hebdomadaire du chantier ${snapshot.project.code}`);
    document.setCreator("PILOTIS");
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const rowsPerPage = 12;
    const chunks = snapshot.workers.length ? Array.from({ length: Math.ceil(snapshot.workers.length / rowsPerPage) }, (_, index) => snapshot.workers.slice(index * rowsPerPage, (index + 1) * rowsPerPage)) : [[]];

    chunks.forEach((workers, pageIndex) => {
      const page = document.addPage(A4_LANDSCAPE);
      drawHeader(page, snapshot, regular, bold, status, pageIndex + 1, chunks.length);
      const top = 456;
      const columns = drawTableHeader(page, snapshot, bold, top);
      const rowHeight = 27;
      workers.forEach((worker, rowIndex) => {
        const y = top - 30 - (rowIndex + 1) * rowHeight;
        const background = rowIndex % 2 === 0 ? rgb(1, 1, 1) : rgb(0.965, 0.97, 0.965);
        let x = 28;
        const values = [
          safeText(worker.name),
          ...worker.hours.map((hours) => hours ? String(hours).replace(".", ",") : "-"),
          `${String(worker.total).replace(".", ",")} h`,
          String(worker.meals),
        ];
        columns.forEach((columnWidth, columnIndex) => {
          page.drawRectangle({ x, y, width: columnWidth, height: rowHeight, color: background, borderColor: grid, borderWidth: 0.55 });
          if (columnIndex === 0) {
            page.drawText(values[0], { x: x + 6, y: y + 15, size: 8, font: bold, color: ink, maxWidth: columnWidth - 12 });
            const detail = [worker.qualification, worker.coefficient ? `Coef. ${worker.coefficient}` : null].filter(Boolean).join(" - ");
            page.drawText(safeText(detail), { x: x + 6, y: y + 5, size: 6.5, font: regular, color: ink, maxWidth: columnWidth - 12 });
          } else {
            drawCentered(page, columnIndex >= 8 ? bold : regular, values[columnIndex], x, y + 9, columnWidth, 8);
          }
          x += columnWidth;
        });
      });

      const totalY = top - 30 - Math.max(workers.length, 1) * rowHeight - 30;
      page.drawRectangle({ x: 28, y: totalY, width: 630, height: 27, color: paleGreen, borderColor: grid, borderWidth: 0.7 });
      page.drawText(pageIndex === chunks.length - 1 ? "TOTAL AGENCE" : "SOUS-TOTAL PAGE", { x: 38, y: totalY + 9, size: 9, font: bold, color: green });
      const pageHours = workers.reduce((sum, worker) => sum + Number(worker.total), 0);
      const pageMeals = workers.reduce((sum, worker) => sum + Number(worker.meals), 0);
      page.drawRectangle({ x: 658, y: totalY, width: 62, height: 27, color: paleGreen, borderColor: grid, borderWidth: 0.7 });
      page.drawRectangle({ x: 720, y: totalY, width: 62, height: 27, color: paleGreen, borderColor: grid, borderWidth: 0.7 });
      drawCentered(page, bold, `${pageHours} h`, 658, totalY + 9, 62, 8.5);
      drawCentered(page, bold, String(pageMeals), 720, totalY + 9, 62, 8.5);

      if (pageIndex === chunks.length - 1) {
        page.drawText(`Total général : ${snapshot.totalHours} h  |  ${snapshot.totalMeals} panier(s)`, { x: 30, y: 42, size: 10, font: bold, color: green });
        page.drawText("Visa conducteur : ____________________", { x: 330, y: 42, size: 9, font: regular, color: ink });
        page.drawText("Visa bureau : ____________________", { x: 590, y: 42, size: 9, font: regular, color: ink });
      }
      page.drawText("Document généré par PILOTIS - Les données correspondent à l'instantané archivé de la feuille.", { x: 30, y: 20, size: 6.8, font: regular, color: rgb(0.35, 0.38, 0.36) });
    });
    return document.save();
  });
}

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization) return Response.json({ error: "Authentification requise" }, { status: 401 });
    const url = new URL(request.url);
    const agencyId = url.searchParams.get("agencyId") ?? "";
    const weekStart = url.searchParams.get("weekStart") ?? "";
    if (!agencyId || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return Response.json({ error: "Agence ou semaine invalide" }, { status: 400 });

    const db = createClient(supabaseUrl, supabasePublishableKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await db.auth.getUser();
    if (!user) return Response.json({ error: "Authentification requise" }, { status: 401 });
    const { data: project } = await db.from("projects").select("id,name,code,location").eq("code", "24-018").single();
    if (!project) return Response.json({ error: "Chantier introuvable" }, { status: 404 });
    const { data: sheet, error } = await db
      .from("weekly_timesheets")
      .select("id,status,snapshot")
      .eq("project_id", project.id)
      .eq("agency_id", agencyId)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (error) throw error;
    if (!sheet) return Response.json({ error: "Générez d'abord la feuille pour créer son PDF." }, { status: 404 });

    const weekEnd = new Date(`${weekStart}T12:00:00Z`);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const today = new Date().toISOString().slice(0, 10);
    const isOpenWeek = weekStart <= today && weekEnd.toISOString().slice(0, 10) >= today;
    const snapshot = isOpenWeek
      ? await rebuildSnapshot(db, project, agencyId, weekStart)
      : sheet.snapshot as TimesheetSnapshot | null ?? await rebuildSnapshot(db, project, agencyId, weekStart);
    if (!snapshot) return Response.json({ error: "Les données de la feuille sont indisponibles." }, { status: 404 });
    if (!sheet.snapshot) await db.from("weekly_timesheets").update({ snapshot, updated_at: new Date().toISOString() }).eq("id", sheet.id);

    const status = sheet.status === "bureau_validated" ? "Validée par le bureau" : sheet.status === "conducteur_validated" ? "Validée par le conducteur" : "Générée";
    const bytes = await buildTimesheetPdf(snapshot, status);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="feuille-${safeText(snapshot.agency.code)}-S${snapshot.weekNumber}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF indisponible";
    return Response.json({ error: message }, { status: 500 });
  }
}
