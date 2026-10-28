#!/usr/bin/env bash
# Gera um arquivo para colar no SQL Editor do Supabase quando o conector não puder
# aplicar a migration (ex.: confirmação de "delete" que não aparece no app).
# O arquivo roda numa transação única: aplica a migration EXATAMENTE como está no
# repositório e a registra em supabase_migrations.schema_migrations (mesmo hash).
# Uso: scripts/sql-editor-bundle.sh supabase/migrations/<arquivo>.sql <versao AAAAMMDDHHMMSS> > saida.sql
# Mantenha cada arquivo abaixo de ~80 KB: colagens maiores falharam silenciosamente no SQL Editor.
set -euo pipefail
f="$1"; v="$2"
[[ "$v" =~ ^[0-9]{14}$ ]] || { echo "versão inválida" >&2; exit 1; }
if grep -q 'ONEMIG' "$f"; then echo "o arquivo contém o delimitador ONEMIG" >&2; exit 1; fi
name="$(basename "$f" .sql | sed -E 's/^[0-9]+_//')"
printf -- '-- ONE CONTROL — migration %s para o SQL Editor. Colar TUDO e clicar em Run.\n-- Tudo roda numa transação só: se der qualquer erro, nada fica gravado.\nbegin;\n\n' "$(basename "$f" .sql)"
cat "$f"
printf "\n-- ===== Registro no histórico de migrations =====\ninsert into supabase_migrations.schema_migrations (version, name, statements, created_by)\nvalues ('%s', '%s', array[\$ONEMIG\$" "$v" "$name"
cat "$f"
printf "\$ONEMIG\$], 'sql-editor');\n\ncommit;\n"
