// Validadores brasileiros espelhando as funções do banco (private.normalize_* / is_valid_tax_id).

export function normalizePhoneBR(input: string | null | undefined): string | null {
  if (!input || !input.trim()) return null;
  const digits = input.replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(digits)) return `+${digits}`;
  if (/^\d{10,11}$/.test(digits)) return `+55${digits}`;
  if (/^\+\d{8,15}$/.test(input.trim())) return `+${digits}`;
  return null;
}

export function normalizeInstagram(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.trim().replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "").replace(/^@|\/.*$/g, "").toLowerCase();
  return v || null;
}

export function isValidTaxId(input: string): boolean {
  const d = input.replace(/\D/g, "");
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    const calc = (len: number) => {
      const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const s = w.reduce((acc, wi, i) => acc + Number(d[i]) * wi, 0);
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    const calc = (len: number) => {
      let s = 0;
      for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
  }
  return false;
}
