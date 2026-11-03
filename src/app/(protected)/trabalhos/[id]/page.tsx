import { notFound } from "next/navigation";
import { requireActiveUser } from "@/server/auth/session";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/server-form";
import { BlockForm, CommentForm, CompleteButton, ItemForm, LinkForm, ResolveFeedbackButton, ReviewForm, StatusButton, StatusNoteForm, VersionForm, WorkForm } from "@/features/works/forms";
import { confirmWorkBackupAction, removeWorkItemAction, removeWorkLinkAction, setWorkItemDoneAction } from "@/features/works/actions";
import { getWork, getWorkContext, workState } from "@/server/services/works";
import { CONTENT_SECTION, isOverdue, nextAction } from "@/lib/works";
import { WORK_CATEGORY, WORK_LINK_KIND, WORK_STATUS, label } from "@/lib/labels";
import { formatDate, formatDateTime, todayISO } from "@/lib/dates";
import { uuid } from "@/lib/validation/schemas";

export const metadata = { title: "Trabalho" };

const LOCATION_HINT: Record<string, string> = { carousel: "Página 3", post: "Peça 1", design: "Peça 1", photo: "Foto 12", video_shoot: "Cena 2", video_edit: "01:23", web: "Página /contato" };
const VERSION_STATUS: Record<string, [string, "info" | "warning" | "success" | "neutral"]> = {
  submitted: ["Em revisão", "info"], changes_requested: ["Ajustes pedidos", "warning"], approved: ["Aprovada", "success"], superseded: ["Substituída", "neutral"],
};

const EVENT_LABEL: Record<string, string> = {
  created: "criou o trabalho", edited: "editou a ficha", due_changed: "mudou o prazo", assigned: "atribuiu um responsável",
  unassigned: "retirou um responsável", content_changed: "alterou o conteúdo", item_removed: "removeu um item", item_done: "concluiu o item",
  item_undone: "reabriu o item", link_added: "adicionou o link", link_removed: "removeu o link", backup_confirmed: "confirmou o backup de",
  blocked: "informou bloqueio", unblocked: "resolveu o bloqueio", comment: "comentou", status_ready: "marcou como pronto",
  status_draft: "voltou para preparação", status_in_production: "iniciou a produção", status_in_review: "enviou para revisão",
  status_done: "concluiu o trabalho", status_cancelled: "cancelou", changes_requested: "pediu ajustes", reopened: "reabriu o trabalho",
  version_submitted: "enviou uma versão", version_approved: "aprovou a versão", feedback_resolved: "resolveu o ajuste",
};

export default async function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const ctx = await requireActiveUser();
  const [work, { people, peopleById, clients }] = await Promise.all([getWork(ctx, id), getWorkContext(ctx)]);
  if (!work) notFound();
  const state = workState(work, ctx);
  const action = nextAction(state);
  const today = todayISO();
  const name = (uid: string | null) => (uid ? peopleById.get(uid)?.full_name ?? "—" : "Sistema");
  const isManager = state.role === "manager";
  const canPrepare = isManager || state.role === "reviewer";
  const canReview = !state.isAssignee && canPrepare;
  const open = work.status !== "done" && work.status !== "cancelled";
  const [statusLabel, statusTone] = label(WORK_STATUS, work.status);
  const section = CONTENT_SECTION[work.category];
  const contentItems = section ? work.work_items.filter((i) => i.kind === section.kind).sort((a, b) => a.position - b.position) : [];
  const checklist = work.work_items.filter((i) => i.kind === "checklist").sort((a, b) => a.position - b.position);
  const links = work.work_links.filter((l) => !l.removed_at);
  const events = [...work.work_events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const clientName = work.client_id ? clients.get(work.client_id) : undefined;
  const versions = [...work.work_versions].sort((a, b) => b.number - a.number);
  const latest = versions[0] ?? null;
  const openFeedback = work.work_feedback.filter((f) => !f.resolved_at);
  const versionNumber = new Map(work.work_versions.map((v) => [v.id, v.number]));
  const linkKinds = state.isAssignee && !isManager ? ["preview", "raw", "editable", "final", "material", "other"] : ["reference", "material", "raw", "preview", "editable", "final", "other"];

  return (
    <>
      <PageHeader eyebrow={`Trabalhos / ${WORK_CATEGORY[work.category]}`} title={work.title} description={clientName ?? "Trabalho interno"} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={statusTone}>{statusLabel}</Badge>
        {state.blocked && <Badge tone="danger">Bloqueado</Badge>}
        {work.status === "draft" && state.missingRequired > 0 && <Badge tone="warning">Aguardando material</Badge>}
        {isOverdue(work.due_current, work.status, today) && <Badge tone="danger">Atrasado</Badge>}
      </div>

      {/* Uma ação principal por tela */}
      <Card className="mb-6 border-primary/60">
        <p className="eyebrow text-muted">Próxima ação</p>
        <p className="mt-1 font-display text-xl font-bold">{action.label}{action.mine ? "" : ""}</p>
        {action.detail && <p className="text-sm text-muted">{action.detail}</p>}
        {state.blocked && <div className="mt-3"><Alert tone="danger" title="Bloqueado">{work.blocked_reason}</Alert></div>}
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {open && !state.blocked && work.status === "draft" && canPrepare && state.hasAssignees && state.missingRequired === 0 && <StatusButton workId={work.id} status="ready" label="Marcar como pronto" />}
          {open && !state.blocked && work.status === "ready" && (state.isAssignee || isManager) && <StatusButton workId={work.id} status="in_production" label="Iniciar produção" />}
          {work.status === "in_review" && canReview && latest?.status === "approved" && state.hasFinal && !state.blocked && <CompleteButton workId={work.id} />}
        </div>
        {open && !state.blocked && work.status === "in_production" && (state.isAssignee || isManager) && (
          <div className="mt-4">
            {openFeedback.length > 0 && <p className="mb-3 text-sm text-warning">{openFeedback.length} ajuste(s) pedido(s) — veja “Versões e ajustes” e marque como resolvidos.</p>}
            <VersionForm workId={work.id} nextNumber={(latest?.number ?? 0) + 1} />
          </div>
        )}
        {work.status === "in_review" && canReview && latest?.status === "submitted" && !state.blocked && (
          <div className="mt-4">
            <p className="mb-3 text-sm">Revise a <a href={latest.url} target="_blank" rel="noopener noreferrer" className="text-link underline">versão {latest.number}{latest.label ? ` — ${latest.label}` : ""}</a>{latest.note ? ` · ${latest.note}` : ""}</p>
            <ReviewForm workId={work.id} versionId={latest.id} number={latest.number} locationHint={LOCATION_HINT[work.category] ?? "Trecho"} />
          </div>
        )}
        {work.status === "in_review" && latest?.status === "approved" && !state.hasFinal && (
          <p className="mt-3 text-sm text-muted">Versão {latest.number} aprovada. Falta o link da <strong>entrega final</strong> em “Materiais e entregas” para concluir.</p>
        )}
        {work.status === "in_review" && latest?.status === "submitted" && (state.isAssignee || isManager) && !state.blocked && (
          <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-link">Enviar nova versão (substitui a versão {latest.number} em revisão)</summary>
            <div className="mt-3"><VersionForm workId={work.id} nextNumber={latest.number + 1} /></div></details>
        )}
        {work.status === "done" && work.completed_at && <p className="mt-2 text-sm text-muted">Concluído em {formatDateTime(work.completed_at)}.</p>}
        {open && state.role && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-link">{state.blocked ? "Resolver bloqueio" : "Informar bloqueio"}</summary><div className="mt-3"><BlockForm workId={work.id} blocked={state.blocked} /></div></details>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle className="mb-3">Resumo</CardTitle>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {work.objective && <div className="sm:col-span-2"><dt className="text-xs text-muted">Objetivo</dt><dd>{work.objective}</dd></div>}
              {work.deliverable_format && <div><dt className="text-xs text-muted">Formato da entrega</dt><dd>{work.deliverable_format}</dd></div>}
              <div><dt className="text-xs text-muted">Prazo</dt><dd className="tabular">{work.due_current ? formatDate(work.due_current) : "Sem prazo"}
                {work.due_original && work.due_original !== work.due_current && <span className="text-muted"> (original {formatDate(work.due_original)})</span>}</dd></div>
              <div><dt className="text-xs text-muted">Responsáveis</dt><dd>{work.work_assignees.map((a) => name(a.user_id)).join(", ") || "A definir"}</dd></div>
              <div><dt className="text-xs text-muted">Revisão e aprovação</dt><dd>{name(work.reviewer_id ?? work.created_by)}</dd></div>
            </dl>
            {work.instructions && <div className="mt-4"><p className="text-xs text-muted">Instruções</p><p className="whitespace-pre-line text-[15px]">{work.instructions}</p></div>}
          </Card>

          {section && (
            <Card>
              <CardTitle className="mb-3">{section.title}</CardTitle>
              {contentItems.length === 0 ? <p className="text-sm text-muted">Nenhum item ainda.</p> : (
                <ol className="flex flex-col gap-3">
                  {contentItems.map((i) => (
                    <li key={i.id} className="rounded-[var(--radius-control)] border border-border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><p className="font-semibold">{i.title}{i.done && <Badge tone="success" className="ml-2">Feito</Badge>}</p>
                          {i.body && <p className="whitespace-pre-line text-[15px]">{i.body}</p>}</div>
                        <div className="flex flex-wrap gap-2">
                          {open && section.kind !== "slide" && <ActionButton action={setWorkItemDoneAction.bind(null, work.id, i.id, !i.done)} label={i.done ? "Desmarcar" : "Marcar feito"} />}
                          {open && canPrepare && <ActionButton action={removeWorkItemAction.bind(null, work.id, i.id)} label="Remover" confirm="Remover este item?" />}
                        </div>
                      </div>
                      {open && canPrepare && <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-link">Editar</summary><div className="mt-2">
                        <ItemForm workId={work.id} kind={section.kind} itemId={i.id} values={i} itemLabel={section.itemLabel} bodyLabel={section.bodyLabel} /></div></details>}
                    </li>
                  ))}
                </ol>
              )}
              {open && canPrepare && <div className="mt-4"><ItemForm workId={work.id} kind={section.kind} itemLabel={section.itemLabel} bodyLabel={section.bodyLabel} /></div>}
              {section.kind === "slide" && <p className="mt-3 text-xs text-muted">Quem executa não altera a copy; mudanças feitas aqui durante a produção avisam os responsáveis.</p>}
            </Card>
          )}

          {(versions.length > 0 || work.work_feedback.length > 0) && (
            <Card>
              <CardTitle className="mb-3">Versões e ajustes</CardTitle>
              {openFeedback.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-sm font-semibold">Ajustes pendentes</p>
                  <ul className="flex flex-col gap-2 text-sm">
                    {openFeedback.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 rounded-[var(--radius-control)] bg-warning-bg p-3">
                        <span><strong>{f.location ? `${f.location}: ` : ""}</strong>{f.body} <span className="text-xs text-muted">· v{versionNumber.get(f.version_id)} · {name(f.created_by)}</span></span>
                        {open && (state.isAssignee || canPrepare) && <ResolveFeedbackButton workId={work.id} feedbackId={f.id} />}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <ol className="flex flex-col gap-3 text-sm">
                {versions.map((v) => {
                  const [vl, vt] = VERSION_STATUS[v.status] ?? [v.status, "neutral" as const];
                  const fb = work.work_feedback.filter((f) => f.version_id === v.id);
                  return (
                    <li key={v.id} className="rounded-[var(--radius-control)] border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <a href={v.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-link underline">Versão {v.number}{v.label ? ` — ${v.label}` : ""}</a>
                        <Badge tone={vt}>{vl}</Badge>
                      </div>
                      <p className="text-xs text-muted">Enviada por {name(v.submitted_by)} em {formatDateTime(v.submitted_at)}
                        {v.decided_at ? ` · revisada por ${name(v.decided_by)} em ${formatDateTime(v.decided_at)}` : ""}</p>
                      {v.note && <p className="mt-1">O que mudou: {v.note}</p>}
                      {v.decision_note && <p className="mt-1 text-muted">“{v.decision_note}”</p>}
                      {fb.length > 0 && (
                        <ul className="mt-2 list-disc pl-5">
                          {fb.map((f) => <li key={f.id} className={f.resolved_at ? "text-muted line-through" : ""}>{f.location ? `${f.location}: ` : ""}{f.body}</li>)}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          <Card>
            <CardTitle className="mb-1">Materiais e entregas</CardTitle>
            <p className="mb-3 text-sm text-muted">Links para o armazenamento autorizado (Drive, WeTransfer, Frame.io…). Enviar o link dos brutos não confirma o backup.</p>
            {links.length === 0 ? <p className="text-sm text-muted">Nenhum link ainda.</p> : (
              <ul className="divide-y divide-border text-sm">
                {links.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <Badge tone={l.kind === "final" ? "success" : l.kind === "preview" ? "info" : "neutral"}>{WORK_LINK_KIND[l.kind] ?? l.kind}</Badge>{" "}
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-link underline">{l.label}</a>
                      <span className="text-xs text-muted"> · {name(l.created_by)} · {formatDateTime(l.created_at)}</span>
                      {l.kind === "raw" && <span className={l.backup_confirmed_at ? "ml-2 text-xs text-success" : "ml-2 text-xs text-warning"}>{l.backup_confirmed_at ? `Backup confirmado em ${formatDateTime(l.backup_confirmed_at)}` : "Backup não confirmado"}</span>}
                      {l.note && <p className="text-xs text-muted">{l.note}</p>}
                    </div>
                    <div className="flex gap-2">
                      {l.kind === "raw" && !l.backup_confirmed_at && state.role && <ActionButton action={confirmWorkBackupAction.bind(null, work.id, l.id)} label="Confirmar backup" confirm="Confirma que os arquivos foram copiados para o armazenamento de backup?" />}
                      {open && (l.created_by === ctx.userId || isManager) && <ActionButton action={removeWorkLinkAction.bind(null, work.id, l.id)} label="Remover" confirm="Remover este link?" />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {work.status !== "cancelled" && state.role && <div className="mt-4"><LinkForm workId={work.id} kinds={linkKinds} /></div>}
          </Card>

          <Card>
            <CardTitle className="mb-3">Histórico e comentários</CardTitle>
            {state.role && <div className="mb-4"><CommentForm workId={work.id} /></div>}
            <ol className="flex flex-col gap-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className={e.kind === "comment" || e.kind === "changes_requested" ? "rounded-[var(--radius-control)] bg-elevated p-3" : ""}>
                  <span className="font-semibold">{name(e.actor_id)}</span> {EVENT_LABEL[e.kind] ?? e.kind}
                  {e.kind === "assigned" || e.kind === "unassigned" ? ` ${name((e.data?.user_id as string) ?? null)}` : ""}
                  {e.body && e.kind !== "comment" && e.kind !== "changes_requested" ? ` “${e.body}”` : ""}
                  <span className="text-xs text-muted"> · {formatDateTime(e.created_at)}</span>
                  {(e.kind === "comment" || e.kind === "changes_requested") && e.body && <p className="mt-1 whitespace-pre-line">{e.body}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle className="mb-1">Preparação</CardTitle>
            <p className="mb-3 text-sm text-muted">Itens obrigatórios precisam estar feitos para o trabalho ficar “Pronto”.</p>
            {checklist.length === 0 ? <p className="text-sm text-muted">Sem itens de preparação.</p> : (
              <ul className="flex flex-col gap-2 text-sm">
                {checklist.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className={i.done ? "text-muted line-through" : ""}>{i.title}{i.required && !i.done && <Badge tone="warning" className="ml-2">Obrigatório</Badge>}</span>
                    {open && <ActionButton action={setWorkItemDoneAction.bind(null, work.id, i.id, !i.done)} label={i.done ? "Desmarcar" : "Feito"} />}
                  </li>
                ))}
              </ul>
            )}
            {open && canPrepare && <div className="mt-4"><ItemForm workId={work.id} kind="checklist" itemLabel="Item" bodyLabel="Detalhe (opcional)" allowRequired /></div>}
          </Card>
          {isManager && (
            <Card>
              <CardTitle className="mb-3">Gestão do trabalho</CardTitle>
              {open && <details><summary className="cursor-pointer text-sm font-semibold text-link">Editar ficha e responsáveis</summary><div className="mt-4">
                <WorkForm workId={work.id} people={people} clients={[...clients.entries()].map(([cid, n]) => ({ id: cid, name: n }))}
                  values={{ ...work, assignees: work.work_assignees.map((a) => a.user_id) }} /></div></details>}
              {work.status === "ready" && <div className="mt-3"><StatusButton workId={work.id} status="draft" label="Voltar para preparação" variant="secondary" /></div>}
              {work.status === "done" && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-link">Reabrir</summary><div className="mt-3"><StatusNoteForm workId={work.id} status="in_production" label="Reabrir trabalho" noteLabel="Motivo da reabertura" /></div></details>}
              {open && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-danger">Cancelar trabalho</summary><div className="mt-3"><StatusNoteForm workId={work.id} status="cancelled" label="Cancelar trabalho" noteLabel="Motivo do cancelamento" variant="danger" /></div></details>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
