#!/usr/bin/env bash
# Teste de concorrência real: várias sessões PostgreSQL tentando confirmar
# recebimentos simultaneamente sobre a mesma cobrança. Executar após scripts/db-test.sh.
set -eo pipefail
DB="${1:-one_control_test}"
PSQL="${PSQL:-psql}"
run() { $PSQL -X -q -t -A -v ON_ERROR_STOP=1 -d "$DB" -c "$1"; }

run "select tests.fixture();" >/dev/null
RECV=$(run "begin; select tests.as_user('admin_a'); select public.create_receivable(jsonb_build_object('client_id', tests.id('client_a'), 'description', 'Concorrência', 'amount', '1000.00', 'due_date', current_date)); commit;" | tail -1)
echo "Cobrança: $RECV (R\$ 1000,00). Disparando 6 confirmações paralelas de R\$ 300,00..."
for i in 1 2 3 4 5 6; do
  ( run "begin; select tests.as_user('admin_a'); select public.confirm_receipt('$RECV', tests.id('account'), 300.00, 'pix', now(), null, 'conc-key-000$i'); select pg_sleep(0.2); commit;" >/dev/null 2>&1 && echo ok || echo rejeitado ) &
done
wait
TOTAL=$(run "select coalesce(sum(amount),0) from public.receipts where receivable_id = '$RECV' and reversed_at is null")
COUNT=$(run "select count(*) from public.receipts where receivable_id = '$RECV'")
MOVS=$(run "select count(*) from public.cash_movements m join public.receipts r on r.id = m.source_id where r.receivable_id = '$RECV'")
echo "Recebido: $TOTAL em $COUNT recebimentos; movimentos de caixa: $MOVS"
[ "$TOTAL" = "900.00" ] && [ "$COUNT" = "3" ] && [ "$MOVS" = "3" ] || { echo "FALHA: sobrecobrança sob concorrência"; exit 1; }

echo "Disparando 5 confirmações paralelas com a MESMA chave de idempotência..."
for i in 1 2 3 4 5; do
  ( run "begin; select tests.as_user('admin_a'); select public.confirm_receipt('$RECV', tests.id('account'), 50.00, 'pix', now(), null, 'same-key-abcdef'); commit;" >/dev/null 2>&1 || true ) &
done
wait
SAME=$(run "select count(*) from public.receipts where idempotency_key = 'same-key-abcdef'")
echo "Recebimentos com a mesma chave: $SAME"
[ "$SAME" = "1" ] || { echo "FALHA: confirmação duplicada"; exit 1; }
echo "OK: concorrência protegida (lock de linha + idempotência)"
