import "server-only";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { importRowSchema } from "@/lib/validation/schemas";
import { sha256Hex } from "@/lib/security/hmac";

export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_MAX_BYTES = 900 * 1024;

// Cabeçalhos aceitos (normalizados sem acento/caixa) → campo do sistema.
const ALIASES: Record<string, string> = {
  nome_contato: "contact_name", contato: "contact_name", nome: "contact_name", contact_name: "contact_name", "nome do contato": "contact_name",
  nome_empresa: "company_name", empresa: "company_name", company_name: "company_name", "nome da empresa": "company_name", razao_social: "company_name",
  email: "email", "e-mail": "email",
  whatsapp: "whatsapp", telefone: "whatsapp", celular: "whatsapp", fone: "whatsapp",
  instagram: "instagram",
  cnpj: "tax_id", cpf: "tax_id", "cnpj/cpf": "tax_id", tax_id: "tax_id", documento: "tax_id",
  descricao: "business_description", servicos: "business_description", "servicos_prestados_ou_solicitados": "business_description",
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export type ParsedImport = {
  hash: string; totalRows: number; mapping: Record<string, string | null>;
  valid: Record<string, string | undefined>[]; invalid: { row: number; errors: string[] }[]; encoding: "utf-8" | "windows-1252" | "xlsx";
};

function decodeText(buf: Buffer): { text: string; encoding: "utf-8" | "windows-1252" } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(buf), encoding: "windows-1252" };
  }
}

async function readRows(filename: string, buf: Buffer): Promise<{ headers: string[]; rows: string[][]; encoding: ParsedImport["encoding"] }> {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "csv") {
    const { text, encoding } = decodeText(buf);
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimitersToGuess: [";", ",", "\t"] });
    const [headers = [], ...rows] = parsed.data;
    return { headers, rows, encoding };
  }
  if (ext === "xlsx") {
    if (!(buf[0] === 0x50 && buf[1] === 0x4b)) throw new Error("Arquivo XLSX inválido");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("Planilha vazia");
    const all: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as unknown[]).slice(1).map((v) => {
        if (v === null || v === undefined) return "";
        if (typeof v === "object" && v && "text" in v) return String((v as { text: unknown }).text);
        if (typeof v === "object" && v && "result" in v) return String((v as { result: unknown }).result ?? "");
        return String(v);
      });
      all.push(values);
    });
    const [headers = [], ...rows] = all;
    return { headers, rows, encoding: "xlsx" };
  }
  throw new Error("Formato não suportado (use CSV ou XLSX)");
}

export async function parseImport(filename: string, buf: Buffer): Promise<ParsedImport> {
  if (buf.length === 0) throw new Error("Arquivo vazio");
  if (buf.length > IMPORT_MAX_BYTES) throw new Error("Arquivo acima do limite de 900 KB");
  const { headers, rows, encoding } = await readRows(filename, buf);
  if (rows.length === 0) throw new Error("Nenhuma linha de dados encontrada");
  if (rows.length > IMPORT_MAX_ROWS) throw new Error(`Máximo de ${IMPORT_MAX_ROWS} linhas por lote`);
  const mapping: Record<string, string | null> = {};
  headers.forEach((h) => { mapping[h] = ALIASES[norm(h)] ?? ALIASES[norm(h).replace(/\s+/g, "_")] ?? null; });
  if (!Object.values(mapping).includes("contact_name") || !Object.values(mapping).includes("company_name")) {
    throw new Error("Colunas obrigatórias não encontradas: nome_contato e nome_empresa");
  }
  const valid: ParsedImport["valid"] = [];
  const invalid: ParsedImport["invalid"] = [];
  rows.forEach((cells, i) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      const field = mapping[h];
      if (field && cells[idx] !== undefined && !(field in obj && obj[field])) obj[field] = String(cells[idx]).trim();
    });
    const r = importRowSchema.safeParse(obj);
    if (r.success) valid.push(r.data);
    else invalid.push({ row: i + 2, errors: r.error.issues.map((x) => x.message) });
  });
  return { hash: sha256Hex(buf), totalRows: rows.length, mapping, valid, invalid, encoding };
}
