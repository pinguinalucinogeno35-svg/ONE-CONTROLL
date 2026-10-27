# Fluxos de dados

## Server Action padrão (`src/server/action.ts`)

1. `authorizeAction()` — JWT verificado (`getClaims`), perfil **ativo** lido sob RLS, MFA.
2. Papel exigido (`admin: true` quando aplicável).
3. `schema.safeParse(input)` — Zod; campos desconhecidos são descartados.
4. Chamada da rotina (`supabase.rpc`) com o JWT do usuário → a rotina revalida
   autorização, estado anterior, duplicidade e grava tudo numa transação.
5. Erros do banco viram mensagens seguras (`toSafeMessage`); detalhes vão só para o log com `requestId`.

## Novo cliente via Google Forms (Cenário A)

```mermaid
sequenceDiagram
  participant V as Vendedor
  participant App as ONE CONTROL
  participant DB as PostgreSQL
  participant GF as Google Forms + Apps Script
  V->>App: Gerar link de cadastro
  App->>DB: create_lead_capture_link() (token 256 bits; grava só SHA-256)
  App-->>V: URL pré-preenchida (?entry.<ref>=<token>) — exibida uma vez
  V->>GF: envia link ao cliente
  GF->>App: POST /api/integrations/google-forms (X-One-Timestamp, X-One-Signature)
  App->>App: HMAC + janela 5 min + schema estrito + tamanho
  App->>DB: integration_events (anti-replay) → ingest_form_submission(token, …)
  DB->>DB: resolve vendedor pelo hash do token, valida link/vendedor, detecta duplicidade
  DB-->>App: imported | duplicate | rejected
  DB->>V: notificação "complete os dados comerciais"
```

## Recebimento (Cenário G)

`confirm_receipt` bloqueia a cobrança (`FOR UPDATE`), verifica idempotência e saldo,
insere `receipts` + `cash_movements` (crédito), recalcula o status a partir da soma
dos recebimentos e apura a comissão elegível — **tudo na mesma transação**.

## Despesa (Cenário D)

`request_expense` (pendente, sem caixa) → `approve_expense` (outro usuário; sem caixa)
→ `confirm_outgoing_payment` (débito no caixa, parcial permitido, idempotente).
