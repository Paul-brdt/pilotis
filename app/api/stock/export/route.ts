import { createClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase";

export const dynamic = "force-dynamic";
const xml = (value: unknown) => String(value ?? "").replace(/[<>&"']/g, character => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;", "'":"&apos;" }[character] || character));
const textCell = (value: unknown, style = "") => `<Cell${style ? ` ss:StyleID="${style}"` : ""}><Data ss:Type="String">${xml(value)}</Data></Cell>`;
const numberCell = (value: number) => `<Cell ss:StyleID="Number"><Data ss:Type="Number">${Number.isFinite(value) ? value : 0}</Data></Cell>`;

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization) return Response.json({ error: "Authentification requise" }, { status: 401 });
    const db = createClient(supabaseUrl, supabasePublishableKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user } } = await db.auth.getUser();
    if (!user) return Response.json({ error: "Authentification requise" }, { status: 401 });
    const [{ data: profile }, { data: project }] = await Promise.all([db.from("profiles").select("role").eq("id", user.id).maybeSingle(), db.from("projects").select("id,name,code").eq("code", "24-018").single()]);
    if (!profile || !["administrateur","bureau","magasinier"].includes(profile.role)) return Response.json({ error: "Export non autorisé" }, { status: 403 });
    if (!project) throw new Error("Chantier introuvable");
    const [itemsResult, locationsResult, movementsResult] = await Promise.all([
      db.from("stock_items").select("id,reference,name,category,unit,minimum_quantity,active").eq("project_id", project.id).order("name"),
      db.from("stock_locations").select("id,name").eq("project_id", project.id).order("name"),
      db.from("stock_movements").select("id,stock_item_id,movement_type,quantity,source_location_id,destination_location_id,inventory_delta,counted_quantity,previous_quantity,note,created_at,stock_items(reference,name,unit),people(full_name),zones(name)").eq("project_id", project.id).order("created_at", { ascending:false }),
    ]);
    if (itemsResult.error || locationsResult.error || movementsResult.error) throw itemsResult.error || locationsResult.error || movementsResult.error;
    const items = itemsResult.data ?? [], locations = locationsResult.data ?? [], movements = movementsResult.data ?? [];
    const byLocation: Record<string,Record<string,number>> = {};
    const add=(item:string,location:string|null,value:number)=>{if(!location)return;(byLocation[item]??={})[location]=(byLocation[item][location]||0)+value};
    for(const movement of movements){if(movement.movement_type==="entree")add(movement.stock_item_id,movement.destination_location_id,Number(movement.quantity));else if(movement.movement_type==="sortie")add(movement.stock_item_id,movement.source_location_id,-Number(movement.quantity));else if(movement.movement_type==="transfert"){add(movement.stock_item_id,movement.source_location_id,-Number(movement.quantity));add(movement.stock_item_id,movement.destination_location_id,Number(movement.quantity))}else add(movement.stock_item_id,movement.source_location_id,Number(movement.inventory_delta||0))}
    const locationName = (id:string|null) => locations.find(location => location.id === id)?.name ?? "";
    const stockRows = items.map(item => { const detail=byLocation[item.id]||{}; const total=Object.values(detail).reduce((sum,value)=>sum+value,0); return `<Row>${textCell(item.reference)}${textCell(item.name)}${textCell(item.category)}${textCell(item.unit)}${numberCell(total)}${numberCell(Number(item.minimum_quantity))}${textCell(item.active?"Actif":"Désactivé")}${locations.map(location=>numberCell(detail[location.id]||0)).join("")}</Row>` }).join("");
    const movementRows = movements.map(movement => { const item=Array.isArray(movement.stock_items)?movement.stock_items[0]:movement.stock_items; const person=Array.isArray(movement.people)?movement.people[0]:movement.people; const zone=Array.isArray(movement.zones)?movement.zones[0]:movement.zones; return `<Row>${textCell(new Date(movement.created_at).toISOString())}${textCell(movement.movement_type)}${textCell(item?.reference)}${textCell(item?.name)}${numberCell(Number(movement.quantity))}${textCell(item?.unit)}${textCell(locationName(movement.source_location_id))}${textCell(locationName(movement.destination_location_id))}${numberCell(Number(movement.inventory_delta||0))}${textCell(person?.full_name)}${textCell(zone?.name)}${textCell(movement.note)}</Row>` }).join("");
    const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel"><Styles><Style ss:ID="Default"><Alignment ss:Vertical="Center"/><Font ss:FontName="Aptos" ss:Size="10"/></Style><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#23483D" ss:Pattern="Solid"/></Style><Style ss:ID="Number"><NumberFormat ss:Format="# ##0.00"/></Style></Styles><Worksheet ss:Name="État du stock"><Table><Row>${["Référence","Désignation","Famille","Unité","Stock total","Seuil","Statut",...locations.map(location=>location.name)].map(value=>textCell(value,"Header")).join("")}</Row>${stockRows}</Table><AutoFilter xmlns="urn:schemas-microsoft-com:office:excel" x:Range="R1C1:R${items.length+1}C${7+locations.length}"/></Worksheet><Worksheet ss:Name="Mouvements"><Table><Row>${["Date","Type","Référence","Article","Quantité","Unité","Source","Destination","Correction inventaire","Personne","Zone chantier","Commentaire"].map(value=>textCell(value,"Header")).join("")}</Row>${movementRows}</Table><AutoFilter xmlns="urn:schemas-microsoft-com:office:excel" x:Range="R1C1:R${movements.length+1}C12"/></Worksheet></Workbook>`;
    return new Response(workbook, { headers: { "content-type":"application/vnd.ms-excel; charset=utf-8", "content-disposition":`attachment; filename="stock-${project.code}-${new Date().toISOString().slice(0,10)}.xls"`, "cache-control":"no-store" } });
  } catch(error) { return Response.json({ error:error instanceof Error ? error.message : "Export impossible" }, { status:500 }); }
}
