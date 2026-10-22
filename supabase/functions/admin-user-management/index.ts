// Supabase Edge Function: admin-user-management
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Never put the service-role key in the browser.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return response({ error: "Server configuration is incomplete." }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return response({ error: "Sign in as an authorized admin first." }, 401);

  const adminDb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const authDb = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authDb.auth.getUser(token);
  if (authError || !authData.user) return response({ error: "Your session is invalid or expired." }, 401);

  const callerId = authData.user.id;
  const { data: membership, error: membershipError } = await adminDb
    .from("marketnest_admins").select("user_id").eq("user_id", callerId).maybeSingle();
  if (membershipError || !membership) return response({ error: "Admin authorization denied." }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return response({ error: "Invalid JSON body." }, 400); }
  const action = String(body.action || "");

  try {
    if (action === "list") {
      const { data: profiles, error: profilesError } = await adminDb
        .from("marketnest_profiles").select("user_id,email,display_name,account_type,suspended,created_at");
      if (profilesError) throw profilesError;
      const admins = await adminDb.from("marketnest_admins").select("user_id");
      if (admins.error) throw admins.error;
      const adminIds = new Set((admins.data || []).map((a) => a.user_id));
      const { data: authUsers, error: authUsersError } = await adminDb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (authUsersError) throw authUsersError;
      const profileById = new Map((profiles || []).map((p) => [p.user_id, p]));
      const users = (authUsers.users || []).map((u) => {
        const p = profileById.get(u.id);
        const accountType = adminIds.has(u.id) ? "admin" : (p?.account_type || u.user_metadata?.account_type || "customer");
        return {
          user_id: u.id, email: u.email || "", display_name: p?.display_name || u.user_metadata?.display_name || u.user_metadata?.store_name || "",
          account_type: accountType, is_admin: adminIds.has(u.id), suspended: !!p?.suspended, created_at: u.created_at,
        };
      });
      return response({ users });
    }

    if (action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const displayName = String(body.display_name || "").trim();
      const accountType = String(body.account_type || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response({ error: "Enter a valid email address." }, 400);
      if (password.length < 8 || password.length > 72) return response({ error: "Password must be 8 to 72 characters." }, 400);
      if (!displayName || displayName.length > 60) return response({ error: "Enter a name of up to 60 characters." }, 400);
      if (!["customer", "seller", "admin"].includes(accountType)) return response({ error: "Choose buyer, seller, or admin." }, 400);
      const { data: created, error: createError } = await adminDb.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { display_name: displayName, store_name: displayName, account_type: accountType === "admin" ? "customer" : accountType },
      });
      if (createError || !created.user) return response({ error: createError?.message || "Account creation failed." }, 400);
      const newUser = created.user;
      const { error: profileError } = await adminDb.from("marketnest_profiles").upsert({
        user_id: newUser.id, email, display_name: displayName,
        account_type: accountType === "admin" ? "customer" : accountType, suspended: false,
      }, { onConflict: "user_id" });
      if (profileError) {
        await adminDb.auth.admin.deleteUser(newUser.id);
        throw profileError;
      }
      if (accountType === "admin") {
        const { error: adminError } = await adminDb.from("marketnest_admins").insert({ user_id: newUser.id });
        if (adminError) {
          await adminDb.auth.admin.deleteUser(newUser.id);
          throw adminError;
        }
      }
      return response({ success: true, user_id: newUser.id });
    }

    const targetId = String(body.user_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(targetId)) return response({ error: "Invalid user ID." }, 400);

    if (action === "set_password") {
      const password = String(body.password || "");
      if (password.length < 8 || password.length > 72) return response({ error: "Password must be 8 to 72 characters." }, 400);
      const { error } = await adminDb.auth.admin.updateUserById(targetId, { password });
      if (error) throw error;
      return response({ success: true });
    }

    if (action === "set_admin") {
      if (targetId === callerId) return response({ error: "You cannot change your own admin access." }, 400);
      if (typeof body.is_admin !== "boolean") return response({ error: "Invalid admin role value." }, 400);
      if (body.is_admin) {
        const { error } = await adminDb.from("marketnest_admins").upsert({ user_id: targetId }, { onConflict: "user_id" });
        if (error) throw error;
      } else {
        const { count, error: countError } = await adminDb.from("marketnest_admins").select("user_id", { count: "exact", head: true });
        if (countError) throw countError;
        if ((count || 0) <= 1) return response({ error: "The last admin cannot be removed." }, 400);
        const { error } = await adminDb.from("marketnest_admins").delete().eq("user_id", targetId);
        if (error) throw error;
      }
      return response({ success: true });
    }

    if (action === "delete") {
      if (targetId === callerId) return response({ error: "You cannot delete your own signed-in admin account." }, 400);
      const { count, error: countError } = await adminDb.from("marketnest_admins").select("user_id", { count: "exact", head: true });
      if (countError) throw countError;
      const targetIsAdmin = await adminDb.from("marketnest_admins").select("user_id").eq("user_id", targetId).maybeSingle();
      if (targetIsAdmin.error) throw targetIsAdmin.error;
      if (targetIsAdmin.data && (count || 0) <= 1) return response({ error: "The last admin cannot be deleted." }, 400);
      const { error } = await adminDb.auth.admin.deleteUser(targetId);
      if (error) throw error;
      return response({ success: true });
    }

    return response({ error: "Unknown action." }, 400);
  } catch (error) {
    console.error("admin-user-management failure", error);
    return response({ error: error instanceof Error ? error.message : "User management action failed." }, 500);
  }
});