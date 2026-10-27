# Backup e restauração

> Confirme no painel do Supabase quais recursos o plano contratado oferece. **Não presumir
> PITR**: ele é um add-on de planos pagos. Planos pagos têm backups diários com retenção
> limitada; o plano gratuito não oferece backups gerenciados para restauração self-service.

## Objetivos sugeridos (validar com a diretoria)
- RPO (perda máxima): 24 h sem PITR; minutos com PITR.
- RTO (tempo de retorno): 4 h.

## Backup lógico complementar (recomendado em qualquer plano)
Semanal + antes de cada migration em produção, armazenado fora do Supabase (bucket privado e criptografado):

```bash
pg_dump "$PROD_DB_URL" --format=custom --no-owner --schema=public --schema=private \
  --file one-control-$(date +%F).dump
supabase storage cp -r ss:///documents ./documents-backup   # arquivos do Storage (opcional)
```

`$PROD_DB_URL` vem do painel (Database → Connection string), nunca do repositório.

## Restauração (teste semestral em projeto separado)
1. Crie um projeto Supabase de restauração.
2. Aplique as migrations até a versão do backup (para recriar papéis/policies) **ou** restaure o dump completo:
   `pg_restore --no-owner --clean --if-exists -d "$RESTORE_DB_URL" one-control-AAAA-MM-DD.dump`
3. Rode `supabase/tests` adaptados (ou valide manualmente) e confira totais: saldo de caixa,
   contas a receber, comissões a pagar.
4. Registre data, duração e problemas encontrados.

## Recuperação de acesso administrativo
- Se um administrador perder o MFA: outro administrador remove o fator em Authentication → Users → Factors.
- Se todos perderem acesso: um responsável com acesso ao painel do Supabase (dono da organização)
  usa o SQL Editor (`private.bootstrap_admin` não serve após 3 admins; ajuste `profiles.status/role`
  via SQL com registro em ata). Mantenha ao menos 2 pessoas com acesso ao painel Supabase com MFA.
