# Checklist de segurança

## Antes de cada deploy
- [ ] `npm audit` sem vulnerabilidades altas/críticas
- [ ] `npm run lint && npm run typecheck && npm test && npm run test:db && npm run build && npm run test:e2e`
- [ ] Migrations novas com RLS, grants explícitos e testes
- [ ] Supabase Security Advisor e Performance Advisor sem alertas críticos
- [ ] Nenhum segredo no diff (`git diff | grep -iE "secret|sb_secret|service_role|password"`)

## Configuração do Supabase (por ambiente)
- [ ] Signups desabilitados (Auth → Providers → Email: "Allow new users to sign up" OFF)
- [ ] MFA TOTP habilitado
- [ ] Senha mínima 12 + requisitos; proteção contra senhas vazadas (planos que oferecem)
- [ ] Site URL e Redirect URLs restritos ao domínio da aplicação (`/auth/confirm`)
- [ ] Templates de e-mail de convite/recuperação usando `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite|recovery`
- [ ] Data API expõe somente `public`
- [ ] Bucket `documents` privado
- [ ] SMTP próprio configurado (limites do SMTP padrão são baixos)
- [ ] Backups/PITR conforme plano contratado (verificar — não presumir)

## Vercel
- [ ] Variáveis por ambiente; `SUPABASE_SECRET_KEY`, `GOOGLE_FORMS_WEBHOOK_SECRET`, `CRON_SECRET`, `VAPID_PRIVATE_KEY` marcadas como sensíveis
- [ ] Par VAPID distinto por ambiente (homologação não envia push com a chave de produção)
- [ ] Domínio com HTTPS; preview deployments protegidos (Vercel Authentication)
- [ ] Cron ativo (`vercel.json`)

## Operação
- [ ] 3 administradores com MFA ativo
- [ ] Revisão trimestral de usuários ativos e convites pendentes
- [ ] Rotação anual (ou em incidente) de `GOOGLE_FORMS_WEBHOOK_SECRET`, `CRON_SECRET` e chave secreta do Supabase
- [ ] Teste de restauração de backup semestral
