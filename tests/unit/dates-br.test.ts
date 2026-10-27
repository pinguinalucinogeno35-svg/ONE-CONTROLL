import { describe, expect, it } from "vitest";
import { dueDateForMonth, formatDate, resolvePeriod, todayISO } from "@/lib/dates";
import { isValidTaxId, normalizeInstagram, normalizePhoneBR } from "@/lib/validation/br";

describe("datas", () => {
  it("dia 31 em meses curtos (política clamp_to_month_end)", () => {
    expect(dueDateForMonth(2026, 2, 31)).toBe("2026-02-28");
    expect(dueDateForMonth(2028, 2, 30)).toBe("2028-02-29");
    expect(dueDateForMonth(2026, 4, 31)).toBe("2026-04-30");
    expect(dueDateForMonth(2026, 1, 31)).toBe("2026-01-31");
  });
  it("formata datas puras sem deslocamento de fuso", () => {
    expect(formatDate("2026-10-01")).toBe("01/10/2026");
  });
  it("hoje no fuso America/Bahia (UTC−3)", () => {
    expect(todayISO(new Date("2026-10-28T02:00:00Z"))).toBe("2026-10-27");
  });
  it("resolve períodos e rejeita intervalo personalizado inválido", () => {
    const now = new Date("2026-10-27T15:00:00Z");
    expect(resolvePeriod("7d", undefined, undefined, now)).toMatchObject({ from: "2026-10-21", to: "2026-10-27" });
    expect(resolvePeriod("year", undefined, undefined, now).from).toBe("2026-01-01");
    expect(resolvePeriod("custom", "2026-10-10", "2026-10-01", now).key).toBe("month");
  });
});

describe("validações brasileiras", () => {
  it("normaliza WhatsApp para E.164", () => {
    expect(normalizePhoneBR("(71) 99999-0000")).toBe("+5571999990000");
    expect(normalizePhoneBR("+55 71 3333-4444")).toBe("+557133334444");
    expect(normalizePhoneBR("123")).toBeNull();
  });
  it("normaliza Instagram", () => {
    expect(normalizeInstagram("https://instagram.com/CafeBahia/")).toBe("cafebahia");
    expect(normalizeInstagram("@One.Studio")).toBe("one.studio");
  });
  it("valida CNPJ e CPF", () => {
    expect(isValidTaxId("11.222.333/0001-81")).toBe(true);
    expect(isValidTaxId("11.111.111/1111-11")).toBe(false);
    expect(isValidTaxId("529.982.247-25")).toBe(true);
    expect(isValidTaxId("123")).toBe(false);
  });
});
