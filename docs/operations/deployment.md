# Deploy

> Nenhum deploy foi realizado. Os passos abaixo exigem as contas da ONE.

## 1. Supabase (repita para homologação e produção)
1. Crie o projeto (região São Paulo, `sa-east-1`).
2. Auth: desabilite signups; habilite MFA TOTP; senha mínima 12; Site URL = domínio do app;
   Redirect URLs = `https://<domínio>/auth/confirm`; configure SMTP próprio.
3. Templates de e-mail (Invite e Reset Password) — recomendados; o app também aceita o link padrão do
   Supabase (sessão no fragmento `#access_token`, tratada por `AuthLinkHandler`). Link recomendado:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (ou `type=recovery&next=/redefinir-senha`).
4. Aplique as migrations (`supabase link` + `supabase db push`) — ver `docs/database/migrations.md`.
   Sem CLI: SQL Editor com `scripts/sql-editor-bundle.sh` (uma migration por vez, < 80 KB; confira se a
   primeira linha começa com `--` e a última é `commit;`). Depois rode `supabase/checks/verify_production.sql`.
5. Rode o Security Advisor.

## 2. Três administradores iniciais
1. Authentication → Users → "Invite user" para cada um dos 3 e-mails (ou "Add user" com senha temporária forte).
2. No SQL Editor (papel postgres), para cada usuário:
   ```sql
   select private.bootstrap_admin('<uuid de auth.users>', 'Nome Completo', 'email@onestudio...');
   ```
   A função aceita no máximo 3 administradores por bootstrap; depois disso use convites.
3. Cada administrador acessa, define senha e cadastra o autenticador (MFA obrigatório).

## 3. Vercel
1. Importe o repositório; framework Next.js; Node 22. O comando de instalação (`npx -y npm@11.21.0 ci`)
   já está em `vercel.json` — não é preciso configurá-lo no painel.
2. Variáveis (Production e Preview separadas, valores de projetos Supabase distintos):
   `APP_ENV`, `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY`, `GOOGLE_FORMS_WEBHOOK_SECRET`, `CRON_SECRET` e, para notificações push,
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (par gerado com
   `npx web-push generate-vapid-keys`, um por ambiente; a chave privada nunca vai ao navegador).
3. `vercel.json` agenda `/api/internal/cron` às 06:17 (America/Bahia). Planos gratuitos limitam crons.
4. Proteja previews (Vercel Authentication).

## 4. Pós-deploy
- Cadastre contas financeiras (Financeiro → Contas e saldos).
- Revise serviços e categorias (Configurações).
- Decida a base de comissão e ative a política (ver `docs/operations/admin-guide.md`).
- Configure o Google Forms (`docs/integrations/google-forms.md`).
- Instale o PWA nos dispositivos (Chrome/Edge: "Instalar app"; iOS Safari: Compartilhar → "Adicionar à Tela de Início").
- Cada colaborador ativa o push no próprio aparelho em **Notificações → Ativar notificações**
  (iPhone/iPad: iOS 16.4+ e somente com o app instalado na tela de início).

## Atualização de dependências
Mensalmente: `npm outdated`, atualizar patches/minors, `npm audit`, rodar toda a suíte.
Majors (Next, Supabase, Zod) com leitura do guia de migração e validação em homologação.
