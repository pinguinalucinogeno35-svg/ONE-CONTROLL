import { notFound } from "next/navigation";
import { Alert, Badge, Button, Card, CardTitle, DataTable, EmptyState, Field, Input, PageHeader, Select, Stat } from "@/components/ui";
import { AppShell } from "@/components/layout/app-shell";
import { InOutChart, ProjectionChart } from "@/components/charts";
import { navigationFor } from "@/lib/permissions";

export const metadata = { title: "Design system" };
export const dynamic = "force-dynamic";

/**
 * Catálogo local dos componentes (manual ONE v1.0, p. 29–31). Dados ILUSTRATIVOS.
 * Indisponível em produção.
 */
export default async function DesignSystemPage({ searchParams }: { searchParams: Promise<{ tema?: string }> }) {
  if (process.env.APP_ENV === "production") notFound();
  const { tema } = await searchParams;
  const theme = tema === "dark" ? "dark" : tema === "light" ? "light" : undefined;
  const rows = [
    { id: "1", nome: "Exemplo A", passo: "Revisar proposta", st: ["Aguardando aprovação", "warning"] as const },
    { id: "2", nome: "Exemplo B", passo: "Registrar recebimento", st: ["Parcialmente paga", "info"] as const },
    { id: "3", nome: "Exemplo C", passo: "—", st: ["Paga", "success"] as const },
    { id: "4", nome: "Exemplo D", passo: "Cobrar cliente", st: ["Vencida", "danger"] as const },
  ];
  return (
    <AppShell nav={navigationFor("admin")} user={{ name: "Pessoa ilustrativa", roleLabel: "Administrador" }} unread={3} theme={theme}
      themeSwitcher={<p className="eyebrow text-sidebar-muted">Catálogo · {theme ?? "sistema"}</p>}>
      <PageHeader eyebrow="Catálogo / Dados ilustrativos" title="Próximas decisões" description="Componentes reais do ONE CONTROL com dados de exemplo."
        actions={<><Button variant="secondary">Ver histórico</Button><Button>Revisar exemplo</Button></>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Saldo atual de caixa" value="R$ 48.250,00" hint="Somente movimentos confirmados" />
        <Stat label="Recebido no período" value="R$ 12.400,00" tone="success" />
        <Stat label="A receber" value="R$ 31.900,00" hint="Previsto, ainda não é caixa" />
        <Stat label="Vencido" value="R$ 2.150,00" tone="danger" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardTitle className="mb-4">Entradas e saídas confirmadas</CardTitle>
          <InOutChart data={[["jun", 820000, 410000], ["jul", 910000, 530000], ["ago", 760000, 480000], ["set", 1040000, 620000], ["out", 1240000, 700000]].map(([l, e, s]) => ({ label: String(l), entradas: Number(e), saidas: Number(s) }))} />
        </Card>
        <Card><CardTitle className="mb-4">Projeção de caixa</CardTitle>
          <ProjectionChart data={[4825000, 5110000, 4980000, 5300000, 5420000, 5180000].map((v, i) => ({ label: `S${i + 1}`, saldo: v }))} />
        </Card>
        <Card className="flex flex-col gap-4"><CardTitle>Estados</CardTitle>
          <div className="flex flex-wrap gap-2"><Badge tone="info">Em produção</Badge><Badge tone="warning">Aguardando revisão</Badge><Badge tone="success">Aprovado</Badge><Badge tone="danger">Bloqueado</Badge><Badge>Arquivado</Badge></div>
          <Alert tone="info">Mensagem de exemplo: contrato aprovado. A cobrança de implementação foi gerada.</Alert>
          <Alert tone="warning" title="Política de comissão pendente">Somente simulação até a ativação.</Alert>
          <Alert tone="success">Recebimento confirmado e lançado no caixa.</Alert>
          <Alert tone="danger">Valor excede o saldo devido (R$ 600,00).</Alert>
        </Card>
        <Card className="flex flex-col gap-4"><CardTitle>Campos e ações</CardTitle>
          <Field id="ds-a" label="Nome do projeto" hint="Use um nome reconhecível pela equipe."><Input defaultValue="Presença digital" /></Field>
          <Field id="ds-b" label="Nome do projeto" error="Informe um nome para continuar."><Input /></Field>
          <Field id="ds-c" label="Origem da venda"><Select defaultValue="direct"><option value="direct">Venda direta</option></Select></Field>
          <div className="flex flex-wrap gap-2"><Button>Revisar peça</Button><Button variant="secondary">Ver histórico</Button><Button variant="danger">Cancelar exemplo</Button></div>
        </Card>
      </div>
      <div className="mt-6">
        <DataTable caption="Tabela ilustrativa" rows={rows} rowKey={(r) => r.id} columns={[
          { key: "n", header: "Registro ilustrativo", cell: (r) => <span className="font-medium">{r.nome}</span> },
          { key: "p", header: "Próximo passo", cell: (r) => r.passo },
          { key: "s", header: "Situação", cell: (r) => <Badge tone={r.st[1]}>{r.st[0]}</Badge> },
        ]} />
      </div>
      <div className="mt-6"><EmptyState title="Nenhum projeto por aqui." description="Crie o primeiro projeto para organizar o trabalho." action={<Button>Criar projeto</Button>} /></div>
    </AppShell>
  );
}
