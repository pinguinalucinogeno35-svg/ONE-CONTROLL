import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireSecret, serverEnv } from "@/lib/env";

/**
 * Cliente com chave secreta (ignora RLS). USO RESTRITO a:
 *  - integração Google Forms (após verificação HMAC),
 *  - convites (auth.admin), cron, Storage (após autorização explícita).
 * Nunca usar para consultas de dados exibidos a usuários.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, requireSecret("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
