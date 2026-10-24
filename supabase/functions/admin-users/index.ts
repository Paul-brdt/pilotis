import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.55.0";

const allowedRoles = new Set([
  "administrateur",
  "bureau",
  "conducteur",
  "chef_chantier",
  "magasinier",
  "consultation",
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request: Request) => {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization) return json({ error: "Authentification requise" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const publishableKey =
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SB_PUBLISHABLE_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const requester = createClient(url, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const {
      data: { user: actor },
    } = await requester.auth.getUser();
    if (!actor) return json({ error: "Authentification requise" }, 401);
    const { data: actorProfile } = await requester
      .from("profiles")
      .select("role")
      .eq("id", actor.id)
      .maybeSingle();
    if (actorProfile?.role !== "administrateur")
      return json({ error: "Accès réservé à l’administrateur" }, 403);

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (request.method === "GET") {
      const [{ data: authData, error: authError }, { data: profiles, error: profileError }] =
        await Promise.all([
          admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
          admin.from("profiles").select("id,full_name,role,created_at"),
        ]);
      if (authError) throw authError;
      if (profileError) throw profileError;
      const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      return json({
        users: authData.users.map((account) => {
          const profile = byId.get(account.id);
          return {
            id: account.id,
            email: account.email ?? "",
            full_name: profile?.full_name ?? null,
            role: profile?.role ?? "consultation",
            created_at: account.created_at,
            last_sign_in_at: account.last_sign_in_at ?? null,
          };
        }),
      });
    }

    if (request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      const projectId = String(body.projectId ?? "");
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const fullName = String(body.fullName ?? "").trim();
      const role = String(body.role ?? "consultation");
      if (!projectId)
        return json({ error: "Chantier manquant." }, 400);
      const { data: actorMembership } = await admin
        .from("project_memberships")
        .select("project_id")
        .eq("project_id", projectId)
        .eq("user_id", actor.id)
        .maybeSingle();
      if (!actorMembership)
        return json({ error: "Vous n’administrez pas ce chantier." }, 403);
      if (!email || !email.includes("@") || password.length < 8 || !fullName)
        return json(
          { error: "Nom, e-mail et mot de passe de 8 caractères minimum requis." },
          400,
        );
      if (!allowedRoles.has(role))
        return json({ error: "Niveau d’accès invalide." }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role },
        user_metadata: { full_name: fullName },
      });
      if (error) throw error;
      const { error: profileError } = await admin.from("profiles").upsert({
        id: data.user.id,
        full_name: fullName,
        role,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw profileError;
      }
      const { error: membershipError } = await admin
        .from("project_memberships")
        .insert({ project_id: projectId, user_id: data.user.id });
      if (membershipError) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw membershipError;
      }
      await admin.from("audit_events").insert({
        project_id: projectId,
        action: "user-create",
        entity_type: "user",
        entity_id: data.user.id,
        payload: { email, full_name: fullName, role, project_id: projectId },
        actor_id: actor.id,
      });
      return json({ ok: true, userId: data.user.id });
    }

    if (request.method === "PATCH") {
      const body = (await request.json()) as Record<string, unknown>;
      const userId = String(body.userId ?? "");
      const role = String(body.role ?? "");
      if (!userId) return json({ error: "Utilisateur manquant." }, 400);
      if (!allowedRoles.has(role))
        return json({ error: "Niveau d’accès invalide." }, 400);
      if (userId === actor.id && role !== "administrateur")
        return json(
          {
            error:
              "Vous ne pouvez pas retirer votre propre accès Administrateur.",
          },
          400,
        );
      const { data: target, error: targetError } =
        await admin.auth.admin.getUserById(userId);
      if (targetError || !target.user)
        return json({ error: "Utilisateur introuvable." }, 404);
      const { error: authError } = await admin.auth.admin.updateUserById(
        userId,
        {
          app_metadata: {
            ...target.user.app_metadata,
            role,
          },
        },
      );
      if (authError) throw authError;
      const { error: profileError } = await admin
        .from("profiles")
        .update({ role })
        .eq("id", userId);
      if (profileError) throw profileError;
      await admin.from("audit_events").insert({
        action: "user-role-update",
        entity_type: "user",
        entity_id: userId,
        payload: { role },
        actor_id: actor.id,
      });
      return json({ ok: true });
    }

    if (request.method === "DELETE") {
      const userId = new URL(request.url).searchParams.get("userId") ?? "";
      if (!userId) return json({ error: "Utilisateur manquant." }, 400);
      if (userId === actor.id)
        return json(
          { error: "Vous ne pouvez pas supprimer votre propre compte." },
          400,
        );
      const { data: target } = await admin.auth.admin.getUserById(userId);
      if (!target.user) return json({ error: "Utilisateur introuvable." }, 404);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        if (/foreign key|violates/i.test(error.message))
          return json(
            {
              error:
                "Ce compte possède déjà un historique métier et ne peut pas être supprimé définitivement.",
            },
            409,
          );
        throw error;
      }
      await admin.from("audit_events").insert({
        action: "user-delete",
        entity_type: "user",
        entity_id: userId,
        payload: { email: target.user.email },
        actor_id: actor.id,
      });
      return json({ ok: true });
    }

    return json({ error: "Méthode non autorisée" }, 405);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      500,
    );
  }
});
