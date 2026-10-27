// Proteção contra CSV/Formula Injection: células iniciadas por = + - @ TAB CR
// são prefixadas com apóstrofo para que planilhas não as interpretem como fórmula.
const DANGEROUS = /^[=+\-@\t\r]/;

export function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return DANGEROUS.test(s) ? `'${s}` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => {
    const s = sanitizeCell(v);
    return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM para acentuação correta no Excel; separador ";" (padrão pt-BR).
  return "﻿" + [headers, ...rows].map((r) => r.map(esc).join(";")).join("\r\n") + "\r\n";
}
