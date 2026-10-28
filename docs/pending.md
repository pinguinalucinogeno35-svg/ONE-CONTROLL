# Status e pendências

## Implementado e testado
- Identidade Visual ONE v1.0: tokens claro/escuro, tipografia, componentes, shell, gráficos e ícones (testes `tests/e2e/identity.spec.ts`; catálogo em `/design-system`).
- Banco completo (15 migrations): schema, constraints, índices, RLS, grants por coluna, rotinas transacionais, auditoria.
- Regras financeiras: recebimentos/pagamentos parciais, idempotência, concorrência, estornos, mensalidades, fluxo de 13 semanas.
- Comissões: taxas 12,5/20/25 não cumulativas, congelamento na aprovação, apuração por recebimento, aprovação/pagamento parcial, reversão.
- Captação Google Forms (lado servidor e banco), importação CSV/XLSX, utilitários (dinheiro, datas, CNPJ, WhatsApp, CSV seguro, HMAC, upload).
- Superfície pública do app: login, redirecionamentos, cabeçalhos de segurança, CSP, PWA (manifest, ícones, SW, offline), layout mobile.

- Notificações push (Web Push): inscrição por dispositivo, reserva sem duplicidade, filtro de usuário inativo e remoção de inscrições expiradas testados no banco (`60_push.sql`); conteúdo, destino do clique e despacho testados em unidade (`push.test.ts`).

## Implementado, mas não testado de ponta a ponta
- Entrega real de push em aparelhos (Android/desktop/iOS): depende das chaves VAPID no ambiente e do app publicado com HTTPS.
- Telas de Tarefas (`/tarefas`): regras e notificações testadas no banco; telas compiladas e conferidas no catálogo, sem Supabase real.
- Todas as telas autenticadas (dashboards, clientes, contratos, projetos, financeiro, comissões, usuários, relatórios, configurações, auditoria) e Server Actions — compilam, passam em lint/tipos e chamam rotinas testadas no banco, mas não foram executadas contra um Supabase real.
- Upload/download de documentos (Storage), convites por e-mail, MFA TOTP, exportações XLSX/CSV autenticadas.
- Gráficos (Recharts) com dados reais.

## Banco definitivo (Supabase) — aplicado em 28/10/2026
- Projeto "One controll definitivo" (região São Paulo). Migrations 1–8 pelo conector; 9–15 pelo SQL Editor
  (`scripts/sql-editor-bundle.sh`), cada uma com o mesmo hash MD5 do arquivo do repositório.
- Conferido contra o banco de teste local (mesmas 15 migrations, 185 asserções SQL aprovadas): funções, colunas,
  constraints, índices, políticas, RLS (39/39), permissões de tabela/coluna/função e triggers idênticos.
- Sem dados fictícios: organização ONE, 12 serviços, 18 categorias, política de comissão em rascunho, 3 grupos de tarefa.
- Extra do Supabase (não é nosso): `public.rls_auto_enable` (RLS automático em tabelas novas) — inofensivo.
- Relatório de segurança: SECURITY DEFINER executável por `authenticated` é intencional (ADR 1; cada rotina valida
  papel/conta ativa); `idempotency_keys` sem policy é intencional (acesso só pelas rotinas).
  Pendente: ativar "Leaked password protection" no Auth (pode exigir plano pago).
- Perfis dos 3 administradores criados com `private.bootstrap_admin` (auditados). E-mails em `@adm.com`
  mantidos por decisão da ONE (28/10/2026), cientes de que a recuperação de senha iria para um domínio de
  terceiros; mitigação: MFA obrigatório, exigido também no banco (migration 0016). Cada administrador deve
  cadastrar o MFA no primeiro acesso.
- Migration 0016 aplicada e conferida (16 migrations; estrutura idêntica à testada). Simulação no banco real:
  admin sem MFA vê só o próprio perfil; com MFA vê os 3 perfis, 12 serviços e 3 grupos.
- Pendente: MFA de cada administrador; configuração do Auth (signup off, MFA, SMTP,
  Site URL, templates).

## Dependente de credencial ou serviço externo (requer autorização da ONE)
- Configurar Auth do Supabase (signup off, MFA, SMTP, templates) e criar os perfis dos administradores.
- Projeto na Vercel, domínio, variáveis de ambiente, Cron, par de chaves VAPID (push).
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
- **Arquivo mestre do logo ONE** (o manual v1.0 registra como pendente): substituir `BrandMark` e os ícones do PWA.
- Pares de cor do tema escuro para estados foram derivados (o manual não traz HEX para eles): validar com o responsável pela marca.

## Planejado para versão futura
- Tarefas: anexos e subtarefas.
- Notificações por e-mail (o push já está implementado; mesma tabela `notifications` + `dedupe_key`).
- Rate limit distribuído (Redis/Upstash) e verificação antivírus de uploads.
- Gerenciamento de tarefas mais completo, comentários em projetos.
- Conciliação bancária/importação de extratos; emissão de boletos/PIX.
- Tipos TypeScript gerados (`supabase gen types`) após o projeto existir.
- Multi-organização (o schema já possui `organization_id`).
