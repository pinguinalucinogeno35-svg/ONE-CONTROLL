import { describe, expect, it } from "vitest";
import { commissionCents, formatBRL, fromDecimalString, parseBRL, toDecimalString } from "@/lib/money";

describe("money (centavos inteiros)", () => {
  it("interpreta formatos brasileiros e canônico", () => {
    expect(parseBRL("2.000,00")).toBe(200000);
    expect(parseBRL("R$ 2.000,5")).toBe(200050);
    expect(parseBRL("2000")).toBe(200000);
    expect(parseBRL("1234.56")).toBe(123456);
    expect(parseBRL("0,01")).toBe(1);
  });
  it("rejeita entradas inválidas e mais de 2 casas", () => {
    expect(() => parseBRL("10,001")).toThrow();
    expect(() => parseBRL("abc")).toThrow();
    expect(() => parseBRL("")).toThrow();
    expect(() => parseBRL("1.2.3")).toThrow();
  });
  it("converte de/para decimal do PostgreSQL sem ponto flutuante", () => {
    expect(fromDecimalString("1234.5")).toBe(123450);
    expect(fromDecimalString(0.1 + 0.2 === 0.3 ? "0.30" : "0.30")).toBe(30);
    expect(toDecimalString(123456)).toBe("1234.56");
    expect(toDecimalString(5)).toBe("0.05");
    expect(toDecimalString(-150)).toBe("-1.50");
  });
  it("formata em BRL", () => {
    expect(formatBRL(25000).replace(/\s/g, " ")).toBe("R$ 250,00");
  });
});

describe("comissão (simulação idêntica ao banco)", () => {
  const base = 200000; // R$ 2.000,00
  it("Cenário B: 12,5% / 20% / 25% não cumulativos", () => {
    expect(commissionCents(base, 1250)).toBe(25000);
    expect(commissionCents(base, 2000)).toBe(40000);
    expect(commissionCents(base, 2500)).toBe(50000);
  });
  it("base zero, centavos e arredondamento meio-para-cima", () => {
    expect(commissionCents(0, 1250)).toBe(0);
    expect(commissionCents(123457, 1250)).toBe(15432); // 154,32125 → 154,32
    expect(commissionCents(4, 1250)).toBe(1); // 0,005 → 0,01
    expect(commissionCents(3, 1250)).toBe(0); // 0,00375 → 0,00
  });
  it("rejeita taxas fora de 0–100%", () => {
    expect(() => commissionCents(100, 10001)).toThrow();
    expect(() => commissionCents(100, 12.5)).toThrow();
  });
});
