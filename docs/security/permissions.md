# Matriz de permissões

Verificada em três camadas: **interface** (`lib/permissions.ts`, menus), **servidor**
(`authorizeAction`, `requireAdmin`, escopo por RLS) e **banco** (RLS, grants por coluna,
rotinas com `require_admin()`/`require_active_user()`).

| Operação | Admin | Vendedor | Garantia no banco |
|---|---|---|---|
| Ver clientes | Todos | Só `seller_id = auth.uid()` | `clients_select` |
| Criar cliente | Para qualquer carteira | Só para si | `create_client` → `resolve_seller` |
| Editar contato do cliente | Sim | Só da carteira | `clients_update` + grant por coluna |
| Trocar responsável | `transfer_client` (auditado) | Não | sem grant em `seller_id` + trigger |
| Arquivar cliente | Sim | Não | `set_client_status` |
| Gerar link de formulário | Sim (qualquer vendedor) | Só para si | `create_lead_capture_link` |
| Importar clientes | Qualquer carteira | Só a própria | `import_clients_batch` |
| Criar/editar contrato rascunho | Sim | Só próprios clientes | `create_contract`, `update_contract_draft` |
| Aprovar/aditivo/cancelar contrato | Sim | Não | `require_admin()` |
| Ver projetos | Todos | Da carteira | `projects_select` |
| Gerenciar projetos/tarefas | Sim | Só atualizar tarefa atribuída | `tasks_update` |
| Contas, caixa, movimentos, recebimentos | Sim | Não | RLS admin-only |
| Ver cobranças | Todas | Dos próprios clientes (status) | `receivables_select` |
| Confirmar recebimento/pagamento | Sim | Não | `require_admin()` |
| Solicitar despesa | Sim | Sim | `request_expense` (categoria de despesa) |
| Aprovar despesa | Sim (≠ solicitante) | Não | `approve_expense` |
| Lançar/ver custos diretos | Sim | Não | `register_payable` + `payables_select` |
| Ver comissões | Todas | Próprias | `commissions_select` |
| Aprovar/pagar comissão | Sim (≠ beneficiário) | Não | CHECK + rotina |
| Alterar percentuais | Rascunho de política | Não | RLS `status = 'draft'` + guarda de política ativa |
| Gerenciar usuários | Sim (não a si mesmo) | Não | `admin_set_user_*` + `profiles_guard` |
| Alterar próprio papel/status | Não | Não | grants + trigger |
| Relatórios | Completos | Da carteira | RLS nas consultas de exportação |
| Auditoria | Leitura | Não | `audit_select_admin`; tabela imutável |

Usuário **inativo/suspenso**: todos os helpers retornam falso → zero linhas e rotinas negadas,
mesmo com JWT válido; além disso o usuário é banido no Supabase Auth (sem renovação de sessão)
e seus links de captação são revogados.

## Como conferir

```bash
npm run test:db       # supabase/tests/10_rls_authorization.sql cobre a matriz acima
```
