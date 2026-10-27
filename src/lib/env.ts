import "server-only";
import { z } from "zod";

// Variáveis exclusivas do servidor. Nunca prefixar segredos com NEXT_PUBLIC_.
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  GOOGLE_FORMS_WEBHOOK_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(32).optional(),
  APP_URL: z.url().optional(),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    // Não expõe valores; apenas nomes ausentes/ inválidos.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Configuração de ambiente inválida: ${names}`);
  }
  cached = parsed.data;
  return cached;
}

export function requireSecret(name: "SUPABASE_SECRET_KEY" | "GOOGLE_FORMS_WEBHOOK_SECRET" | "CRON_SECRET"): string {
  const v = serverEnv()[name];
  if (!v) throw new Error(`${name} não configurado`);
  return v;
}
