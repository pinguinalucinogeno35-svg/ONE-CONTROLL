# Módulos

| Módulo | Rotas | Rotinas no banco | Quem acessa |
|---|---|---|---|
| Autenticação | `/login`, `/recuperar-acesso`, `/redefinir-senha`, `/verificar-mfa`, `/auth/confirm` | `activate_own_profile` | Público (login) |
| Dashboard | `/dashboard` | `admin_financial_summary`, `admin_monthly_cash_series`, `cash_flow_projection`, `seller_dashboard` | Admin (completo), vendedor (próprio) |
| Clientes | `/clientes`, `/clientes/novo`, `/clientes/[id]` | `create_client`, `set_client_status`, `transfer_client` | Vendedor (carteira), admin (todos; transfere) |
| Captação | `/clientes/links`, `/api/integrations/google-forms` | `create_lead_capture_link`, `revoke_lead_capture_link`, `ingest_form_submission` | Vendedor/admin; integração (service role) |
| Importação | `/clientes/importar` | `import_clients_batch` | Vendedor (própria carteira), admin |
| Contratos | `/contratos`, `/contratos/novo`, `/contratos/[id]`, `/editar` | `create_contract`, `update_contract_draft`, `submit_contract`, `approve_contract`, `reject_contract`, `amend_contract`, `cancel_contract`, `calculate_commission_estimate` | Vendedor (cria/edita rascunho), admin (aprova/aditivo/cancela) |
| Tarefas | `/tarefas`, `/tarefas/nova`, `/tarefas/[id]`, `/tarefas/grupos` | `save_task_group`, `people_directory`, `create_task`, `update_task`, `set_task_status`, `comment_task`, `run_task_reminders` | Todos (vendedor: grupos liberados; edita só o que criou), admin gerencia grupos — ver `docs/architecture/tasks.md` |
| Projetos | `/projetos`, `/projetos/novo`, `/projetos/[id]` | (tabelas com RLS) | Admin (gerencia), vendedor (consulta carteira; atualiza tarefas atribuídas) |
| Contas a receber | `/financeiro/contas-a-receber`, `/financeiro/receitas` | `create_receivable`, `cancel_receivable`, `generate_due_receivables`, `confirm_receipt`, `reverse_receipt` | Admin |
| Despesas/custos | `/despesas`, `/financeiro/despesas`, `/financeiro/custos` | `request_expense`, `register_payable`, `approve_expense`, `reject_expense`, `cancel_payable`, `confirm_outgoing_payment`, `reverse_outgoing_payment` | Vendedor (solicita), admin (aprova/paga/custos) |
| Caixa | `/financeiro`, `/financeiro/fluxo-de-caixa` | `get_cash_balances`, `transfer_between_accounts`, `cash_flow_projection` | Admin |
| Comissões | `/comissoes`, `/configuracoes#politicas` | `activate_commission_policy`, `approve_commissions`, `cancel_commission`, `pay_commissions` (+ apuração automática no recebimento) | Vendedor (próprias), admin |
| Usuários | `/vendedores` | `create_user_invitation`, `provision_invited_profile`, `admin_set_user_status`, `admin_set_user_role` | Admin |
| Relatórios | `/relatorios`, `/api/exports/[report]` | consultas sob RLS | Admin (todos), vendedor (carteira) |
| Documentos | `/api/files`, `/api/files/[id]` | `register_attachment` | Conforme o registro vinculado |
| Notificações | `/notificacoes` | `private.notify*` | Destinatário |
| Configurações | `/configuracoes` | — | Admin |
| Auditoria | `/auditoria` | `private.log_audit` | Admin (somente leitura) |
| Rotina diária | `/api/internal/cron` | `run_daily_jobs` | Vercel Cron |
