import { describe, expect, it } from "vitest";
import { sanitizeCell, toCsv } from "@/lib/security/csv";
import { signPayload, verifySignature } from "@/lib/security/hmac";
import { detectFile, safeFilename } from "@/lib/security/file-sniff";
import { rateLimit } from "@/lib/security/rate-limit";
import { can, navigationFor } from "@/lib/permissions";

describe("CSV formula injection", () => {
  it("neutraliza células perigosas", () => {
    expect(sanitizeCell("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(sanitizeCell("+55 71")).toBe("'+55 71");
    expect(sanitizeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(sanitizeCell("-10")).toBe("'-10");
    expect(sanitizeCell("Empresa")).toBe("Empresa");
  });
  it("gera CSV com BOM, separador ; e escape", () => {
    const csv = toCsv(["a", "b"], [["x;y", "=1+1"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"x;y";\'=1+1');
  });
});

describe("HMAC do Google Forms", () => {
  const secret = "s".repeat(40);
  const body = '{"a":1}';
  const ts = "1790000000";
  it("aceita assinatura válida dentro da janela", () => {
    expect(verifySignature({ secret, timestamp: ts, signature: signPayload(secret, ts, body), body, nowSeconds: 1790000100 })).toEqual({ ok: true });
  });
  it("rejeita assinatura ausente, inválida, corpo alterado e mensagens antigas (replay)", () => {
    const sig = signPayload(secret, ts, body);
    expect(verifySignature({ secret, timestamp: null, signature: sig, body })).toMatchObject({ reason: "missing" });
    expect(verifySignature({ secret, timestamp: ts, signature: "zz", body, nowSeconds: 1790000000 })).toMatchObject({ reason: "malformed" });
    expect(verifySignature({ secret, timestamp: ts, signature: sig, body: '{"a":2}', nowSeconds: 1790000000 })).toMatchObject({ reason: "invalid" });
    expect(verifySignature({ secret, timestamp: ts, signature: sig, body, nowSeconds: 1790000301 })).toMatchObject({ reason: "expired" });
    expect(verifySignature({ secret: "x".repeat(40), timestamp: ts, signature: sig, body, nowSeconds: 1790000000 })).toMatchObject({ reason: "invalid" });
  });
});

describe("upload: tipo real do arquivo", () => {
  it("aceita PDF real e rejeita executável renomeado", () => {
    expect(detectFile("contrato.pdf", new TextEncoder().encode("%PDF-1.7 ..."))).toEqual({ ext: "pdf", mime: "application/pdf" });
    expect(detectFile("contrato.pdf", new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(detectFile("script.exe", new Uint8Array([0x4d, 0x5a]))).toBeNull();
    expect(detectFile("foto.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toMatchObject({ mime: "image/png" });
  });
  it("sanitiza nomes", () => {
    expect(safeFilename("../../etc/passwd")).toBe("._._etc_passwd");
  });
});

describe("rate limit", () => {
  it("bloqueia após o limite e libera após a janela", () => {
    const k = `t-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(k, 3, 1000, 0).allowed).toBe(true);
    expect(rateLimit(k, 3, 1000, 10).allowed).toBe(false);
    expect(rateLimit(k, 3, 1000, 1001).allowed).toBe(true);
  });
});

describe("matriz de permissões (camada de apresentação)", () => {
  it("vendedor não tem capacidades financeiras/administrativas", () => {
    for (const c of ["finance.cash", "expenses.approve", "costs.manage", "commissions.policies", "users.manage", "audit.read", "clients.transfer", "reports.full"] as const) {
      expect(can("seller", c)).toBe(false);
      expect(can("admin", c)).toBe(true);
    }
    expect(can("seller", "expenses.request")).toBe(true);
  });
  it("menu do vendedor oculta financeiro, auditoria e configurações", () => {
    const hrefs = navigationFor("seller").map((n) => n.href);
    expect(hrefs).not.toContain("/financeiro");
    expect(hrefs).not.toContain("/auditoria");
    expect(hrefs).not.toContain("/configuracoes");
    expect(hrefs).toContain("/comissoes");
  });
});
