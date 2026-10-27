// Valores monetários no JavaScript são SEMPRE inteiros em centavos.
// O banco usa numeric(15,2); a conversão é feita por strings ("1234.56"),
// nunca por number de ponto flutuante.

export type Cents = number;

const MAX_CENTS = 999_999_999_999_999; // 15 dígitos (numeric(15,2))

export class MoneyError extends Error {}

function assertSafe(c: number): Cents {
  if (!Number.isSafeInteger(c) || Math.abs(c) > MAX_CENTS) throw new MoneyError("Valor monetário fora do limite");
  return c;
}

/**
 * Converte texto digitado em BRL ("2.000,50", "2000,5", "R$ 10", "1234.56") em centavos.
 * Rejeita mais de duas casas decimais e caracteres inválidos.
 */
export function parseBRL(input: string): Cents {
  const raw = input.replace(/\s|R\$/g, "").trim();
  if (raw === "") throw new MoneyError("Informe um valor");
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  let intPart: string;
  let decPart = "";
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(body) || /^\d+(,\d{1,2})?$/.test(body)) {
    // Formato brasileiro: ponto de milhar opcional e vírgula decimal.
    const [i, d = ""] = body.split(",");
    intPart = (i ?? "").replace(/\./g, "");
    decPart = d;
  } else if (/^\d+\.\d{1,2}$/.test(body)) {
    // Formato canônico "1234.56".
    const [i, d = ""] = body.split(".");
    intPart = i ?? "";
    decPart = d;
  } else {
    throw new MoneyError("Valor monetário inválido");
  }
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0"));
  return assertSafe(negative ? -cents : cents);
}

/** Converte o texto decimal vindo do PostgreSQL ("1234.5", "1234.56") em centavos. */
export function fromDecimalString(value: string | number | null | undefined): Cents {
  if (value === null || value === undefined || value === "") return 0;
  const s = typeof value === "number" ? value.toFixed(2) : value.trim();
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new MoneyError(`Decimal inválido: ${s}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return assertSafe(m[1] ? -cents : cents);
}

/** Centavos → "1234.56" (formato aceito pelo PostgreSQL). */
export function toDecimalString(cents: Cents): string {
  assertSafe(cents);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100);
}

/** Formata diretamente um decimal do banco. */
export function formatDecimalBRL(value: string | number | null | undefined): string {
  return formatBRL(fromDecimalString(value));
}

/**
 * Comissão = base × bps / 10000, arredondada ao centavo (meio para longe de zero),
 * idêntico ao ROUND(numeric) do PostgreSQL. Usado apenas para SIMULAÇÃO na interface;
 * o valor oficial é sempre recalculado no banco.
 */
export function commissionCents(baseCents: Cents, rateBps: number): Cents {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) throw new MoneyError("Taxa inválida");
  assertSafe(baseCents);
  const sign = baseCents < 0 ? -1 : 1;
  const product = BigInt(Math.abs(baseCents)) * BigInt(rateBps);
  const q = (product + 5000n) / 10000n;
  return sign * Number(q);
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
}
