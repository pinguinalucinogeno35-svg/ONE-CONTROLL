# Guia do administrador

## Primeiro acesso
Login → definir senha → cadastrar autenticador (MFA obrigatório).

## Convidar vendedores
Vendedores e usuários → Convidar colaborador (nome, e-mail, papel). O convite vale 7 dias.
Para desligar: "Gerenciar acesso" → status Inativo/Suspenso + motivo. Efeito imediato:
acesso bloqueado, sessões não renovam, links de captação revogados; histórico preservado.
Transfira a carteira em cada cliente (Transferir carteira) — comissões já adquiridas
continuam com o vendedor original.

## Rotina financeira
1. **Contratos aguardando aprovação** (Contratos → filtro): revise valores, origem e itens;
   aprove (gera cobrança de implementação e agenda de mensalidades) ou devolva com motivo.
2. **Contas a receber**: registre recebimentos (parciais permitidos) indicando conta e data.
   Correções: Receitas → Estornar (motivo obrigatório).
3. **Despesas**: aprove/rejeite solicitações (você não aprova as próprias); registre pagamentos.
4. **Custos**: lance custos diretos por projeto e registre pagamentos.
5. **Comissões**: aprove as adquiridas e registre pagamentos (parciais permitidos).
6. **Fluxo de caixa**: acompanhe 13 semanas; vencidos e estimativas comerciais aparecem à parte.

## Atualizar políticas de comissão
Configurações → Políticas de comissão. A política inicial tem as taxas 12,5% / 20% / 25% e
**base/fato gerador pendentes**. Para ativar: edite o rascunho (base de cálculo, fato gerador,
limite de recorrência, exigência de aprovação) → Ativar. Para mudar regras depois, crie uma
nova versão com vigência futura e ative-a: a anterior é encerrada; contratos aprovados mantêm
a taxa congelada e comissões já aprovadas não são recalculadas.

## Conferir permissões
`npm run test:db` (matriz completa) e, em homologação, `tests/e2e/authenticated.spec.ts`.

## Auditoria
Auditoria → filtros por ação/entidade. Registros são imutáveis.

## Tarefas
Tarefas → Grupos: crie os grupos (ex.: AUDIOVISUAL) e marque "Vendedores podem criar e designar tarefas neste grupo" onde fizer sentido. Grupos sem essa marcação aceitam apenas tarefas criadas pela administração. Você vê todas as tarefas na aba "Todas".
