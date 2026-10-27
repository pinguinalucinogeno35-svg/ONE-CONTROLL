# Integração Google Forms

**Status:** implementada e testada com testes automatizados (assinatura, replay, payload,
falhas, reprocessamento). **Não conectada** a um formulário real — depende de
configuração pela ONE (passos abaixo). Sem `GOOGLE_FORMS_WEBHOOK_SECRET` o endpoint
responde 503 (nada é simulado).

## Escolha técnica
Apps Script com **gatilho instalável `onFormSubmit`** (vinculado ao formulário). A Forms API
exigiria polling + OAuth de conta de serviço; o gatilho entrega em segundos e com menos
infraestrutura.

## 1. Criar o formulário
Perguntas (títulos exatos — editáveis em `FIELD_TITLES` no script):

| Pergunta | Tipo |
|---|---|
| Nome do contato | Resposta curta (obrigatória) |
| Nome da empresa | Resposta curta (obrigatória) |
| E-mail | Resposta curta (validação de e-mail) |
| WhatsApp | Resposta curta |
| Instagram | Resposta curta |
| Serviços prestados ou solicitados | Caixas de seleção ou parágrafo (use os nomes do catálogo) |
| ref | Resposta curta — **coloque na última seção com a descrição "Não altere este campo"** |

Inclua o aviso de privacidade (ver `docs/security/lgpd.md`).

## 2. Descobrir o entry do campo `ref`
Formulário → ⋮ → "Gerar link pré-preenchido" → preencha `ref` com `TESTE` → copie o link.
Ele terá `entry.123456789=TESTE`. O número é o **token_entry_id**.

## 3. Configurar no ONE CONTROL
Configurações → Google Forms: ID do formulário (da URL de edição `/forms/d/<ID>/edit`),
URL pública (`…/viewform`) e entry do `ref`.

## 4. Segredo e Apps Script
1. Gere o segredo: `openssl rand -hex 32` → `GOOGLE_FORMS_WEBHOOK_SECRET` na Vercel.
2. No formulário: Extensões → Apps Script. Cole `scripts/google-forms/Code.gs` e
   `appsscript.json` (Configurações do projeto → mostrar manifesto).
3. Propriedades do script: `ONE_ENDPOINT_URL=https://<domínio>/api/integrations/google-forms`
   e `ONE_HMAC_SECRET=<mesmo segredo>`.
4. Execute `setup()` e autorize. Envie uma resposta de teste usando um link gerado pelo app.

## Protocolo
`POST` JSON `{event_id, form_id, response_id, submitted_at, ref, fields{…}}` com cabeçalhos
`X-One-Timestamp` (epoch s) e `X-One-Signature = hex(HMAC_SHA256(segredo, "<ts>.<corpo>"))`.

Servidor: limite 32 KB → assinatura em tempo constante → janela ±5 min → schema estrito
(campos extras rejeitados) → `integration_events` (único por `event_id`; reprocessa apenas
eventos `failed`) → `ingest_form_submission` (vendedor pelo hash do token; link ativo, não
expirado, dentro do limite de usos, formulário correspondente, vendedor ativo; duplicidade na
carteira por e-mail/WhatsApp) → cliente `pending_completion` + notificação ao vendedor.

Respostas: 200 `imported|duplicate|rejected`; 401 assinatura; 413 tamanho; 422 payload;
429 limite; 500 falha temporária (o script reenfileira e tenta a cada 15 min, até 48 vezes);
503 integração não configurada.

## Monitoramento
- `integration_events` (status `failed`, `attempts`) — visível a administradores.
- `form_submissions` com `import_status = rejected` e `validation_errors`.
- Logs `google_forms_delivery` / `google_forms_failed` na Vercel.

## Segurança do token
Token de 256 bits, exibido uma única vez, armazenado só como SHA-256, com validade (1–90 dias)
e limite de usos. Se o cliente alterar o campo `ref`, a resposta é rejeitada (nunca atribuída a
outro vendedor por adivinhação).
