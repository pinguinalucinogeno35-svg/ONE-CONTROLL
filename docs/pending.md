# Status e pendências

## Implementado e testado
- Banco completo (13 migrations): schema, constraints, índices, RLS, grants por coluna, rotinas transacionais, auditoria.
- Regras financeiras: recebimentos/pagamentos parciais, idempotência, concorrência, estornos, mensalidades, fluxo de 13 semanas.
- Comissões: taxas 12,5/20/25 não cumulativas, congelamento na aprovação, apuração por recebimento, aprovação/pagamento parcial, reversão.
- Captação Google Forms (lado servidor e banco), importação CSV/XLSX, utilitários (dinheiro, datas, CNPJ, WhatsApp, CSV seguro, HMAC, upload).
- Superfície pública do app: login, redirecionamentos, cabeçalhos de segurança, CSP, PWA (manifest, ícones, SW, offline), layout mobile.

## Implementado, mas não testado de ponta a ponta
- Todas as telas autenticadas (dashboards, clientes, contratos, projetos, financeiro, comissões, usuários, relatórios, configurações, auditoria) e Server Actions — compilam, passam em lint/tipos e chamam rotinas testadas no banco, mas não foram executadas contra um Supabase real.
- Upload/download de documentos (Storage), convites por e-mail, MFA TOTP, exportações XLSX/CSV autenticadas.
- Gráficos (Recharts) com dados reais.

## Dependente de credencial ou serviço externo (requer autorização da ONE)
- Criar projetos Supabase (dev/homologação/produção), aplicar migrations, configurar Auth (signup off, MFA, SMTP, templates).
- Projeto na Vercel, domínio, variáveis de ambiente, Cron.
- Google Form real + Apps Script + segredo HMAC.
- Criação dos 3 administradores (`private.bootstrap_admin`).
- Execução dos E2E autenticados em homologação.
- Confirmação dos recursos de backup/PITR do plano Supabase contratado.

## Pendente de decisão comercial
- **Base de cálculo e fato gerador da comissão** (política inicial em rascunho; somente simulação até a ativação).
- Comissão já paga sobre recebimento estornado: compensar em pagamentos futuros? (hoje: alerta aos administradores).
- Limite temporal de comissão sobre mensalidades.
- Bonificação para indicadores externos (não implementada; a indicação é apenas registrada).
- Recebimento acima do devido (crédito/adiantamento) — hoje bloqueado.
- Prazos de retenção LGPD (sugestões em `docs/security/lgpd.md`).
- Identidade visual oficial (tokens de cor e logotipo provisórios).

## Planejado para versão futura
- Notificações push e e-mail (arquitetura pronta: tabela `notifications` + `dedupe_key`).
- Rate limit distribuído (Redis/Upstash) e verificação antivírus de uploads.
- Gerenciamento de tarefas mais completo, comentários em projetos.
- Conciliação bancária/importação de extratos; emissão de boletos/PIX.
- Tipos TypeScript gerados (`supabase gen types`) após o projeto existir.
- Multi-organização (o schema já possui `organization_id`).
