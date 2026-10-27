// Limitador de taxa em memória (janela deslizante simples).
// LIMITAÇÃO: em ambiente serverless com várias instâncias o contador é por
// instância. Para produção com tráfego alto, substitua por armazenamento
// compartilhado (ex.: Upstash/Redis) mantendo esta interface. O Supabase Auth
// aplica limites próprios ao login, que continuam valendo.
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return { allowed: true, retryAfterMs: 0 };
  }
  if (b.count >= limit) return { allowed: false, retryAfterMs: b.resetAt - now };
  b.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
