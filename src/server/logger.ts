import "server-only";

// Log estruturado (JSON por linha), com redação de campos sensíveis.
const SENSITIVE = /(password|senha|token|secret|authorization|cookie|key|signature)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE.test(k) ? "[REDACTED]" : redact(v, depth + 1)]),
  );
}

type Level = "debug" | "info" | "warn" | "error";

export function log(level: Level, message: string, context: Record<string, unknown> = {}) {
  const entry = { ts: new Date().toISOString(), level, message, ...(redact(context) as object) };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
