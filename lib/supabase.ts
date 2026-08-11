import { createBrowserClient } from "@supabase/ssr";

// These are intentionally public Supabase client settings. They are a runtime
// fallback for Vercel builds where NEXT_PUBLIC_* variables were not configured.
// Never put a service-role or secret key in this module.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://hzyexpiohfkiuomjrutj.supabase.co";
export const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_mvg5u0MqIv2BsCQ21bBbYw_kOl4KerD";

export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}