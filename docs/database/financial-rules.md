# Regras financeiras

## Conceitos que nunca se misturam

| Conceito | Fonte | Entra no caixa? |
|---|---|---|
| Valor vendido/contratado | `contracts.implementation_amount`, `monthly_amount` (aprovados) | Não |
| Receita recorrente contratada | `billing_schedules` ativas (mensal) | Não |
| A receber | saldo de `receivables` a vencer | Não |
| Vencido | saldo de `receivables` com vencimento < hoje | Não |
| Recebido | `receipts` não estornados | **Sim** (crédito em `cash_movements`) |
| Saldo de caixa | `cash_accounts.opening_balance` + créditos − débitos | — |

"Saldo de caixa" não é lucro. O sistema não calcula lucro líquido (não há tributos,
rateios nem ajustes contábeis). O relatório de rentabilidade por projeto é
**margem de contribuição em caixa** = recebido − custos diretos pagos − comissões pagas.

## Contratos

- Valores ≥ 0; ao menos implementação ou mensalidade > 0.
- Mensalidade exige início da recorrência, dia (1–31) e periodicidade.
- Entrega antes do início só com justificativa administrativa (campo exclusivo de admin).
- Rascunho → aguardando aprovação → aprovado → ativo (após 1ª mensalidade gerada) → concluído/cancelado.
- Vendedor edita apenas rascunho/aguardando; após aprovação, só **aditivo** administrativo (nova versão, afeta cobranças futuras).
- Cancelamento cancela agendas e cobranças **futuras sem recebimento**; histórico preservado.
- Referência de cobrança: valores do cabeçalho. `contract_services` é descritivo.

## Cobranças

- Implementação: gerada na aprovação (vencimento informado pelo admin; padrão = início).
- Mensalidades: `generate_due_receivables` (admin ou cron) gera até 30 dias à frente, idempotente
  por (agenda, competência). Dia 29/30/31 em meses curtos → último dia do mês.
- Status derivado: `paid` (recebido ≥ valor), `partially_paid`, `overdue`, `open`, `cancelled`.
- Recebimento: somente admin; parcial permitido; nunca acima do saldo; chave de idempotência
  obrigatória; lock da cobrança evita sobrecobrança concorrente (testado com 6 sessões paralelas).
- Correção = estorno (`reverse_receipt`): marca o recebimento, cria `financial_adjustments` e débito compensatório.
- Crédito/adiantamento (receber acima do devido) **não** é suportado no MVP.

## Despesas e custos

- Despesa: qualquer colaborador solicita → admin (diferente do solicitante) aprova/rejeita → admin paga.
- Custo direto: somente admin lança (já aprovado) → admin paga.
- Caixa só muda na confirmação do pagamento. Pagamento parcial permitido; acima do saldo, nunca.
- Cancelamento só sem pagamentos ativos.

## Comissões

- Taxas oficiais (não cumulativas): direta **12,5%** (1250 bps), indicação **20%** (2000), indicação da indicação **25%** (2500).
- Cálculo: `round(base × bps / 10000, 2)`; CHECK no banco garante a coerência.
- Simulação na tela (instantânea) ≠ valor oficial (banco).
- Taxa congelada no contrato na **aprovação** (`commission_rate_bps`); política futura não altera.
- **Pendente de decisão comercial**: base de cálculo e fato gerador. Enquanto a política estiver
  em rascunho, nenhuma comissão a pagar é gerada.
- Quando ativa (`on_receipt`): cada recebimento elegível gera uma comissão sobre o valor recebido:
  - `implementation_only`: recebimentos de implementação;
  - `first_month_only`: recebimentos da 1ª competência mensal;
  - `implementation_plus_first_month`: ambos;
  - `recurring_receipts`: mensalidades (com limite opcional de meses);
  - `all_eligible_receipts`: implementação, mensalidades (com limite) e serviços adicionais.
- `on_contract_approval`: gera uma comissão na aprovação (apenas bases não recorrentes).
- Vendedor da comissão = vendedor do contrato (transferência de carteira não move comissões).
- Aprovação: admin ≠ vendedor. Pagamento: parcial permitido, soma ≤ saldo, uma saída de caixa por pagamento, idempotente.
- Estorno do recebimento: comissão não paga → `reversed`; já paga → admins notificados para decidir compensação (**pendente de decisão**).
