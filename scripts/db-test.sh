#!/usr/bin/env bash
# Recria um banco local descartável, aplica as migrations e executa os testes SQL.
# Requer PostgreSQL 15+ local (psql). Uso: scripts/db-test.sh [nome_do_banco]
set -eo pipefail
DB="${1:-one_control_test}"
PSQL="${PSQL:-psql}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PGOPTIONS='--client-min-messages=warning'
$PSQL -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -v ON_ERROR_STOP=1 -q -d "$DB" -f "$ROOT/supabase/tests/local_bootstrap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ migration $(basename "$f")"
  $PSQL -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
echo "→ seed.sql"
$PSQL -v ON_ERROR_STOP=1 -q -o /dev/null -d "$DB" -f "$ROOT/supabase/seed.sql"
fail=0
for t in "$ROOT"/supabase/tests/[0-9]*_*.sql; do
  echo "→ teste $(basename "$t")"
  if ! PGOPTIONS='--client-min-messages=notice' $PSQL -v ON_ERROR_STOP=1 -q -o /dev/null -d "$DB" -f "$t" 2>&1 \
       | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e 's/^NOTICE:  /  /'; then fail=1; fi
done
if [ "$fail" -ne 0 ]; then echo "FALHA nos testes SQL"; exit 1; fi
echo "OK: todos os testes SQL passaram"
