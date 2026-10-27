# Decisões arquiteturais (ADRs resumidos)

| # | Decisão | Motivo | Consequência |
|---|---|---|---|
| 1 | Escritas sensíveis via funções PostgreSQL `SECURITY DEFINER` chamadas com o JWT do usuário | Atomicidade real, autorização no banco, `auth.uid()` confiável | Regras de negócio em SQL; testadas diretamente no PostgreSQL |
| 2 | RLS em todas as tabelas `public` + **grants por coluna**; sem UPDATE amplo | RLS protege linhas, não colunas | Vendedor só altera colunas de contato do cliente, `read_at` de notificação e o próprio nome/telefone |
| 3 | Helpers de autorização consultam `profiles.status` a cada consulta | Usuário desativado perde acesso imediatamente, mesmo com JWT válido | Pequeno custo por consulta (mitigado por `(select …)` → initPlan) |
| 4 | Dinheiro: `numeric(15,2)` no banco; centavos inteiros no JS; transporte como string decimal | Sem ponto flutuante | Utilitários em `lib/money` |
| 5 | Percentuais em pontos-base inteiros; arredondamento `ROUND` (meio para longe de zero) | Determinismo; CHECK `commission_amount = round(base*bps/10000,2)` | Simulação JS replica a mesma regra (testada) |
| 6 | Política de comissão versionada; ativa = imutável; taxa congelada no contrato na aprovação | Mudanças futuras não alteram histórico | Base/fato gerador vêm da política do contrato (se ativa) ou da ativa na data do recebimento |
| 7 | Política inicial com taxas definidas e **base/fato gerador nulos (rascunho)** | Decisão comercial pendente | Só simulação provisória; nenhuma comissão a pagar até ativação |
| 8 | Comissão adquirida sobre o **valor efetivamente recebido** | Descontos/pagamentos parciais refletem naturalmente | Uma comissão por recebimento (índice único) |
| 9 | Valores de cabeçalho do contrato são a referência de cobrança; `contract_services` é descritivo | Evita somatórios ambíguos | Documentado na UI |
| 10 | Dias 29–31: `clamp_to_month_end` | Política explícita para meses curtos | Configurável em `system_settings` como documentação; regra em `private.due_date_for_month` |
| 11 | Saldo devedor derivado de `receipts`/`outgoing_payments` não estornados | Fonte única de verdade | Status recalculado em cada operação |
| 12 | Registros financeiros confirmados são imutáveis; correções por estorno + `financial_adjustments` | Auditoria | Triggers bloqueiam UPDATE/DELETE |
| 13 | Storage sem policies para `authenticated`; upload/download pelo servidor | A autorização do arquivo segue a do registro, não o nome da pasta | URLs assinadas de 60 s |
| 14 | Next.js 16 `proxy.ts` (substitui `middleware.ts`) com CSP por nonce | Recomendação atual do Next.js | Páginas protegidas são dinâmicas (`no-store`) |
| 15 | Componentes de UI próprios no padrão shadcn/ui (sem CLI), seguindo a Identidade Visual ONE v1.0 | Menos dependências, controle de acessibilidade, fidelidade ao manual | `src/components/ui`; ver `docs/architecture/design-system.md` |
| 16 | Rate limit em memória para login/exports/webhook | Simplicidade no MVP; Supabase Auth tem limites próprios | Trocar por Redis/Upstash se houver múltiplas instâncias com tráfego alto |
| 17 | npm 11 (`packageManager`) | npm 10.9 falha ao resolver peers do Vitest 5 | CI usa `npx npm@11.21.0 ci` |
| 18 | Next 16.4.3 (patch de segurança recente) | `npm audit`: RCE/DoS em 16.0–16.4.0 | Exceção à regra de "versões com 2 semanas" justificada por segurança |
| 19 | Override `uuid@11.1.1` para o exceljs | Advisory GHSA-w5hq-g745-h8pq | exceljs usa apenas `v4()`, compatível |
| 20 | Sem fila offline | Evita duplicidade/conflito financeiro | PWA informa quando a operação exige conexão |
| 21 | Rentabilidade por projeto = margem de contribuição em caixa | Critério explícito, sem tributos/rateios | Rotulado como tal no relatório |
| 22 | Tokens semânticos com tema claro e escuro (pares próprios), preferência por cookie lido no servidor | Manual v1.0 p. 17–18 e 28; CSP sem script inline | Tema do sistema por padrão; alternância na sidebar |
| 23 | Fontes via Fontsource (self-hosted) | Sem dependência de terceiros em runtime; `font-src 'self'` | Pacotes `@fontsource*` no lockfile |
| 24 | Marca como texto identificador até o master do logo | Manual proíbe redesenhar ou criar símbolo alternativo | `BrandMark` e ícones substituíveis |
