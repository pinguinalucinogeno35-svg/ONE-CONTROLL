import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { authorizeAction } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { REPORTS } from "@/server/services/reports";
import { resolvePeriod, formatDate, formatDateTime } from "@/lib/dates";
import { sanitizeCell, toCsv } from "@/lib/security/csv";
import { rateLimit } from "@/lib/security/rate-limit";
import { log } from "@/server/logger";

export async function GET(request: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  try {
    const ctx = await authorizeAction();
    const { report } = await params;
    const def = REPORTS[report];
    if (!def) return NextResponse.json({ error: "Relatório inexistente" }, { status: 404 });
    if (def.adminOnly && ctx.profile.role !== "admin") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    if (!rateLimit(`export:${ctx.userId}`, 30, 10 * 60_000).allowed) return NextResponse.json({ error: "Muitas exportações; aguarde." }, { status: 429 });
    const sp = request.nextUrl.searchParams;
    const period = resolvePeriod(sp.get("periodo") ?? "custom", sp.get("de") ?? undefined, sp.get("ate") ?? undefined);
    const format = sp.get("formato") === "xlsx" ? "xlsx" : "csv";
    const data = await def.run(ctx, period.from, period.to);
    const meta = [
      [data.title],
      [`Gerado em ${formatDateTime(new Date().toISOString())} por ${ctx.profile.full_name}`],
      [`Período: ${formatDate(period.from)} a ${formatDate(period.to)}${ctx.profile.role === "seller" ? " · escopo: sua carteira" : ""}`],
      [],
    ];
    log("info", "report_exported", { report, format, userId: ctx.userId, rows: data.rows.length, requestId: ctx.requestId });
    const filename = `one-control-${report}-${period.from}_${period.to}.${format}`;
    const headers = { "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" };

    if (format === "csv") {
      const body = toCsv(meta[0] as string[], [...meta.slice(1), data.headers, ...data.rows]);
      return new NextResponse(body, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = "ONE CONTROL";
    const ws = wb.addWorksheet(data.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
    meta.forEach((m) => ws.addRow(m.map(sanitizeCell)));
    const head = ws.addRow(data.headers.map(sanitizeCell));
    head.font = { bold: true };
    data.rows.forEach((r) => ws.addRow(r.map((c) => (typeof c === "number" ? c : sanitizeCell(c)))));
    ws.columns.forEach((c) => { c.width = 22; });
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as ArrayBuffer, { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
    log("error", "export_failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Falha ao gerar relatório" }, { status: 500 });
  }
}
