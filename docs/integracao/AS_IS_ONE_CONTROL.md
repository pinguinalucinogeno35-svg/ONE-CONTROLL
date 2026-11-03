# AS-IS — Inventário do ONE CONTROL (aplicativo principal)

Fase 1 da integração ONE CONTROL + ONE Dashboard (pasta "Integração ONE Control + Dashboard", 01/11/2026).
**Somente leitura: nenhuma alteração de código ou banco foi feita para este inventário.**

| Item | Valor |
|---|---|
| Repositório | `pinguinalucinogeno35-svg/ONE-CONTROLL`, branch `claude/tender-keller-0xbcqj` |
| SHA auditado | `b9e4265` (03/11/2026) |
| Stack | Next.js 16 (App Router, Server Actions), React 19, TypeScript strict, Tailwind 4, Zod 4, Supabase (Postgres 17, Auth, Storage), Vercel |
| Produção | Vercel (`my-project-one-controll-one-8b39.vercel.app`, plano Hobby); Supabase "One controll definitivo" (São Paulo, plano Free) |
| Banco | 16 migrations aplicadas e conferidas (hash idêntico ao repositório); 39 tabelas, RLS em 39/39 |
| Testes | SQL 200 asserções + concorrência (LOCAL/CI); unitários 50; E2E 60 públicos (LOCAL/CI); 12 E2E autenticados **não executados** (exigem homologação) |

Níveis de evidência usados abaixo: **EXISTE** (código + teste), **PARCIAL**, **NÃO EXISTE**, **NÃO VERIFICADO**.
"Testado" aqui significa LOCAL/CI, salvo indicação de REAL (consulta somente leitura no banco de produção).

## 1. Identidade, papéis e segurança
| Tema | Estado | Evidência |
|---|---|---|
| Login e-mail/senha, sem cadastro público | EXISTE | `src/features/auth`, Auth do Supabase com signup desligado (configuração informada pela ONE) |
| Convites por administrador | EXISTE | `create_user_invitation`, `provision_invited_profile`, `/vendedores` |
| Papéis | EXISTE — **apenas `admin` e `seller`** | enum `user_role`; não há papel de produção (designer, filmmaker etc.) |
| MFA obrigatório para admin | EXISTE — app **e banco** (migration 0016) | `70_admin_mfa.sql`; conferido no banco real |
| Conta desativada perde acesso imediato | EXISTE | helpers `is_active_*` consultam `profiles.status` a cada requisição |
| RLS + grants por coluna + rotinas `SECURITY DEFINER` | EXISTE | migrations 0007/0012; testes `10_rls_authorization.sql` |
| Auditoria imutável | EXISTE | `audit_logs` + `/auditoria` |
| Backup/restauração | **NÃO VERIFICADO / insuficiente** | plano Free do Supabase não tem backup diário; nenhuma restauração testada |
| Login Google | NÃO EXISTE | só e-mail/senha |

## 2. Navegação atual (`src/lib/permissions.ts`)
Admin: Dashboard, Clientes, Contratos, Tarefas, Projetos, Financeiro (Receitas, Contas a receber, Despesas, Custos, Fluxo de caixa), Comissões, Vendedores, Relatórios, Notificações, Configurações, Auditoria.
Vendedor: Dashboard, Clientes, Contratos, Tarefas, Projetos (da carteira), Minhas despesas, Comissões, Relatórios, Notificações.
O app é **comercial-financeiro**; não há área de produção criativa. Não há nenhum recurso de IA (o item UX-01 "remover IA" não se aplica a este app).

## 3. Domínios existentes
| Domínio | Tabelas / rotinas | Observação para a integração |
|---|---|---|
| Clientes (fonte única, deduplicação) | `clients`, `client_service_interests`, `client_transfers`, `create_client`, `transfer_client` | Vendedor vê só a própria carteira; admin vê todos |
| Captação (Google Forms, importação) | `lead_capture_links`, `form_submissions`, `import_jobs` | — |
| Contratos e comissões | `contracts`, `contract_versions`, `commission_*` | versionamento/aprovação **de contrato**, não de peça criativa |
| Projetos | `projects`, `project_tasks` (checklist simples: título, responsável, status, prazo) | base possível para "Projeto → Trabalho" |
| Tarefas internas | `task_groups`, `tasks`, `task_events` (histórico imutável), notificações personalizadas | atribuição a qualquer colaborador ativo; **sem trava por profissão** (não existe profissão) |
| Financeiro | `receivables`, `receipts`, `payables`, `cash_*`, `financial_adjustments` | exclusivo admin com MFA |
| Arquivos | bucket privado `documents`, `file_attachments` (cliente, projeto, contrato, despesa ou cobrança — **não tarefa**), URL assinada de 60 s | — |
| Notificações | `notifications`, push Web (`push_subscriptions`) | — |

## 4. Matriz funcional (documento 05) — lado ONE CONTROL
| ID | Estado | Comentário |
|---|---|---|
| INICIO-01 Início pessoal | PARCIAL | card "Minhas tarefas" no dashboard; foco comercial |
| TRA-01 Lista de trabalhos | PARCIAL | `/tarefas`: filtros por grupo e situação; sem filtro por cliente/categoria/semana |
| TRA-02 Ficha única | NÃO EXISTE | tarefa tem título, descrição, grupo, prioridade, prazo e comentários; sem briefing, materiais, versão, entrega |
| TRA-03 Dependências | NÃO EXISTE | — |
| TRA-04 Prazo original × vigente | PARCIAL | só `due_date`; alterações ficam no histórico `task_events` |
| CLI-01 Cadastro único | EXISTE | com deduplicação por e-mail/WhatsApp/CNPJ |
| CLI-02 Kit do cliente | NÃO EXISTE | anexos por cliente existem (privados), sem organização de marca |
| EQU-01 Convites e perfis | EXISTE (sem "profissão") | |
| EQU-02 Disponibilidade | NÃO EXISTE | |
| EQU-03 Atribuição livre | EXISTE em tarefas | vendedor só atribui em grupos liberados |
| CAL-01 / CAP-01 Calendário e captação | NÃO EXISTE | |
| VID-01/02, FOT-01/02, DES-01/02, EDI-01/02 | NÃO EXISTE | |
| APR-01 Aprovar versão de entrega | NÃO EXISTE | |
| ARQ-01 Biblioteca | PARCIAL | Storage privado com autorização no servidor; sem vínculo a tarefa/versão |
| PUB-01 Publicação | NÃO EXISTE | |
| GES-01 Painel gerencial | PARCIAL | painel financeiro/comercial; sem capacidade de produção |
| FIN-01 Financeiro | EXISTE | somente admin |
| CRM-01 | PARCIAL | clientes/leads com status e origem; sem funil de oportunidades |
| PLA-01 / MET-01 | NÃO EXISTE | |
| SEG-01 Autorização | EXISTE | UI + servidor + RLS + Storage pelo servidor |
| BKP-01 Backup/restore | NÃO VERIFICADO | ver seção 1 |
| INT-01 Integração | BLOQUEADO | repositório do Dashboard não acessível nesta sessão |
| UX-01 Remover IA | N/A | não há IA no ONE CONTROL |

## 5. Pendências para a Fase 2 (decisão de integração)
1. **Acesso ao repositório `jpserpaaadev10/one-dashboard`** para o inventário do outro lado (SHA real, tabelas, telas). Sem isso, não há como comparar entidades nem escolher a fonte única de cada domínio.
2. **Papel de produção:** o ONE CONTROL só tem `admin` e `seller`. Colaboradores de produção precisariam de um papel próprio (sem comercial nem financeiro) — decisão de segurança da direção.
3. **Visibilidade de clientes para a produção:** proposta coerente com T05/T06 — ver apenas clientes de trabalhos atribuídos.
4. **Backup:** com dados reais de produção criativa e financeiros, recomenda-se plano pago do Supabase (backup diário) e um teste de restauração antes do piloto.
