import { createClient } from "@supabase/supabase-js";

// Cliente sem sessão para leituras públicas da vitrine (respeita RLS).
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}
