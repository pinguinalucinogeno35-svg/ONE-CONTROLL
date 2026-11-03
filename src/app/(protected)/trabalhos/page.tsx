import Link from "next/link";
import { requireActiveUser } from "@/server/auth/session";
import { Button, EmptyState, Field, LinkButton, PageHeader, Select } from "@/components/ui";
import { WorkCard } from "@/features/works/work-card";
import { getWorkContext, listWorks, workState, type WorkFilters } from "@/server/services/works";
import { WORK_CATEGORY, WORK_STATUS } from "@/lib/labels";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata = { title: "Trabalhos" };

type SP = Promise<{ ver?: string; situacao?: string; tipo?: string; cliente?: string; pessoa?: string }>;

export default async function WorksPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireActiveUser();
  const sp = await searchParams;
  const isAdmin = ctx.profile.role === "admin";
  const scope: WorkFilters["scope"] = sp.ver === "revisar" ? "review" : sp.ver === "todos" && isAdmin ? "all" : isAdmin && !sp.ver ? "all" : "mine";
  const filters: WorkFilters = { scope, status: sp.situacao, category: sp.tipo, client: sp.cliente, person: sp.pessoa };
  const [{ people, peopleById, clients }, works] = await Promise.all([getWorkContext(ctx), listWorks(ctx, filters)]);
  const today = todayISO();
  const tabs = [
    ...(isAdmin ? [{ key: "todos", label: "Todos" }] : []),
    { key: "meus", label: "Meus trabalhos" },
    { key: "revisar", label: "Para revisar" },
  ];
  const currentTab = scope === "all" ? "todos" : scope === "review" ? "revisar" : "meus";
  return (
    <>
      <PageHeader eyebrow="Produção / Trabalhos" title="Trabalhos" description="Cada trabalho reúne instruções, materiais, prazo, responsáveis, entrega e aprovação."
        actions={isAdmin ? <LinkButton href="/trabalhos/novo">Novo trabalho</LinkButton> : undefined} />
      <nav aria-label="Visões" className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link key={t.key} href={`/trabalhos?ver=${t.key}`} aria-current={currentTab === t.key ? "page" : undefined}
            className={cn("rounded-full border px-4 py-2 text-sm", currentTab === t.key ? "border-primary bg-primary text-on-primary" : "border-border bg-surface")}>{t.label}</Link>
        ))}
      </nav>
      <form className="mb-6 grid gap-3 sm:grid-cols-5 sm:items-end" method="get">
        <input type="hidden" name="ver" value={currentTab} />
        <Field id="f-situacao" label="Situação"><Select name="situacao" defaultValue={sp.situacao ?? "open"}>
          <option value="open">Em aberto</option>
          {Object.entries(WORK_STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          <option value="any">Todas</option>
        </Select></Field>
        <Field id="f-tipo" label="Tipo"><Select name="tipo" defaultValue={sp.tipo ?? ""}>
          <option value="">Todos</option>
          {Object.entries(WORK_CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select></Field>
        <Field id="f-cliente" label="Cliente"><Select name="cliente" defaultValue={sp.cliente ?? ""}>
          <option value="">Todos</option>
          {[...clients.entries()].map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </Select></Field>
        {isAdmin ? (
          <Field id="f-pessoa" label="Pessoa"><Select name="pessoa" defaultValue={sp.pessoa ?? ""}>
            <option value="">Todas</option>
            {people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </Select></Field>
        ) : <div />}
        <div><Button type="submit" variant="secondary">Filtrar</Button></div>
      </form>
      {works.length === 0 ? (
        <EmptyState title={scope === "review" ? "Nada para revisar" : "Nenhum trabalho por aqui"}
          description={isAdmin ? "Crie um trabalho e atribua a qualquer pessoa da equipe." : "Quando alguém atribuir um trabalho a você, ele aparece aqui."} />
      ) : (
        <ul className="flex flex-col gap-3">
          {works.map((w) => (
            <li key={w.id}><WorkCard work={w} state={workState(w, ctx)} clientName={w.client_id ? clients.get(w.client_id) : undefined} people={peopleById} today={today} /></li>
          ))}
        </ul>
      )}
    </>
  );
}
