import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function proxy(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization)
    return Response.json({ error: "Authentification requise" }, { status: 401 });
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`${supabaseUrl}/functions/v1/admin-users`);
  targetUrl.search = sourceUrl.search;
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      authorization,
      apikey: supabasePublishableKey,
      "content-type": "application/json",
    },
    body:
      request.method === "POST" || request.method === "PATCH"
        ? await request.text()
        : undefined,
    cache: "no-store",
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;