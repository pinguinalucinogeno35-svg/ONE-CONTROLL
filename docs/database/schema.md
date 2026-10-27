# Schema do banco

Schemas: `public` (exposto pela Data API, RLS obrigatória), `private` (helpers, não exposto),
`extensions` (pgcrypto), `auth`/`storage` (Supabase).

## Tabelas (public)

| Tabela | Finalidade | Observações |
|---|---|---|
| organizations | Empresa proprietária | Single-org no MVP (`one-studio-digital`) |
| profiles | Colaboradores (1:1 `auth.users`) | `role`/`status` só por rotina administrativa; trigger impede autoalteração |
| user_invitations | Convites | Expiram em 7 dias; único pendente por e-mail |
| services | Catálogo editável | Seed real na migration 0013 |
| clients | Clientes | `seller_id` atual, `original_seller_id` imutável, normalização de contatos, CNPJ/CPF validado, `possible_duplicate_of` |
| client_service_interests | Interesses | único (cliente, serviço) |
| client_transfers | Histórico de carteira | Append-only |
| lead_capture_links | Links de captação | Apenas `token_hash` (SHA-256) |
| form_submissions | Respostas do Forms | único (form, resposta); payload mínimo; expurgo em 90 dias |
| import_jobs | Lotes CSV/XLSX | único por hash de conteúdo + carteira |
| commission_policies | Políticas versionadas | Uma ativa por organização; ativa é imutável |
| projects / project_tasks | Projetos e tarefas | Acompanhamento básico |
| contracts | Contratos | Número `ONE-AAAA-NNNNNN`; taxa congelada na aprovação; CHECKs de datas/recorrência |
| contract_services | Itens descritivos | — |
| contract_versions | Versões (snapshot jsonb) | Append-only |
| contract_referrals | Origem/indicação | CHECK de forma por tipo de origem |
| financial_categories | Categorias (despesa/custo/receita) | Hierarquia opcional |
| cash_accounts | Contas | Saldo inicial imutável após movimentos |
| cash_movements | Movimentos de caixa | Append-only; único (origem, id, conta) |
| billing_schedules | Agendas recorrentes | Uma ativa por contrato |
| receivables | Contas a receber | único (agenda, competência); 1 implementação ativa por contrato |
| receipts | Recebimentos | Imutáveis (salvo marcação de estorno); idempotency_key única |
| payables | Despesas e custos | Fluxo de aprovação por CHECKs |
| outgoing_payments | Pagamentos | Idem `receipts` |
| financial_adjustments | Estornos/anulações | Append-only; um estorno por origem |
| commission_entitlements | Comissões | CHECK base×taxa; único por recebimento; sem autoaprovação |
| commission_payouts / commission_payout_items | Pagamentos de comissão | Soma ≤ saldo (verificado sob lock) |
| file_attachments | Metadados de arquivos | Exatamente um vínculo; MIME/tamanho limitados |
| audit_logs | Auditoria | Imutável (expurgo só com flag de retenção) |
| notifications | Notificações internas | Destinatário só altera `read_at`; dedupe |
| system_settings | Configurações | CHECK impede chaves com nomes de segredo |
| idempotency_keys | Chaves genéricas | Limpeza diária |
| integration_events | Eventos de integração | único (provedor, id externo) |

Convenções: PK `uuid`, `timestamptz`, `numeric(15,2)`, percentuais em bps, enums para status,
índices em todas as FKs e filtros de dashboard (ver migrations).
