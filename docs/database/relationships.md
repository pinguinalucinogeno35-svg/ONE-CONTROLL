# Relacionamentos (ER)

```mermaid
erDiagram
  organizations ||--o{ profiles : possui
  organizations ||--o{ services : cataloga
  organizations ||--o{ financial_categories : classifica
  organizations ||--o{ commission_policies : define
  organizations ||--o{ cash_accounts : mantém
  organizations ||--o{ user_invitations : convida
  organizations ||--o{ audit_logs : registra
  organizations ||--o{ import_jobs : importa
  organizations ||--o{ system_settings : configura

  profiles ||--o{ clients : "responsável (seller_id)"
  profiles ||--o{ lead_capture_links : gera
  profiles ||--o{ payables : solicita
  profiles ||--o{ commission_entitlements : recebe
  profiles ||--o{ commission_payouts : recebe
  profiles ||--o{ notifications : recebe

  clients ||--o{ client_service_interests : tem
  services ||--o{ client_service_interests : ""
  clients ||--o{ client_transfers : historico
  clients ||--o{ projects : possui
  clients ||--o{ contracts : assina
  clients ||--o{ receivables : deve
  projects ||--o{ project_tasks : contém
  projects |o--o{ contracts : "vinculado (opcional)"
  projects |o--o{ payables : "custo direto"

  contracts ||--o{ contract_services : itens
  contracts ||--o{ contract_versions : versões
  contracts ||--|| contract_referrals : origem
  contracts ||--o{ billing_schedules : recorrência
  contracts ||--o{ receivables : cobra
  contracts ||--o{ commission_entitlements : gera
  commission_policies ||--o{ contracts : "taxa congelada"
  commission_policies ||--o{ commission_entitlements : regra

  billing_schedules ||--o{ receivables : gera
  receivables ||--o{ receipts : "recebida por"
  receipts |o--o| commission_entitlements : "fato gerador"
  cash_accounts ||--o{ receipts : credita
  cash_accounts ||--o{ outgoing_payments : debita
  cash_accounts ||--o{ cash_movements : registra
  cash_accounts ||--o{ commission_payouts : debita

  payables ||--o{ outgoing_payments : "paga por"
  financial_categories ||--o{ payables : classifica
  commission_payouts ||--o{ commission_payout_items : aloca
  commission_entitlements ||--o{ commission_payout_items : quita

  lead_capture_links ||--o{ form_submissions : recebe
  form_submissions }o--o| clients : cria

  file_attachments }o--o| clients : ""
  file_attachments }o--o| projects : ""
  file_attachments }o--o| contracts : ""
  file_attachments }o--o| payables : ""
  file_attachments }o--o| receivables : ""
```

Relacionamentos indiretos relevantes:

- `cash_movements.source_type/source_id` aponta para `receipts`, `outgoing_payments`,
  `commission_payouts` ou para o id de uma transferência — validado pelas rotinas (não aceito do cliente).
- `financial_adjustments.source_*` aponta para o registro estornado/anulado.
- O vendedor da comissão é `contracts.seller_id` (vendedor da venda), **não** o responsável atual do cliente.
