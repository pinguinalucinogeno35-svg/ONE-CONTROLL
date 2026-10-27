import { createBrowserClient } from "@supabase/ssr";

/** Cliente do navegador — usado apenas para Auth (login, MFA, recuperação). */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
