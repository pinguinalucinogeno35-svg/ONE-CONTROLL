/**
 * ONE CONTROL — Integração Google Forms → aplicativo (Apps Script vinculado ao formulário)
 *
 * Segurança:
 *  - Envio somente para endpoint HTTPS, com assinatura HMAC-SHA256 sobre
 *    "<timestamp>.<corpo>" e timestamp (o servidor rejeita mensagens > 5 min).
 *  - O segredo fica em Propriedades do Script (nunca no código ou no formulário).
 *  - event_id único por resposta: reenvios são idempotentes no servidor.
 *  - O vendedor NÃO é enviado: o servidor resolve pelo token do link ("ref").
 *
 * Configuração (Extensões → Apps Script → Configurações do projeto → Propriedades do script):
 *   ONE_ENDPOINT_URL   = https://<seu-domínio>/api/integrations/google-forms
 *   ONE_HMAC_SECRET    = <mesmo valor de GOOGLE_FORMS_WEBHOOK_SECRET no servidor>
 * Depois execute uma vez a função `setup()` e autorize.
 */

// Títulos das perguntas do formulário → campos esperados pelo servidor.
var FIELD_TITLES = {
  nome_contato: 'Nome do contato',
  nome_empresa: 'Nome da empresa',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  servicos: 'Serviços prestados ou solicitados'
};
var TOKEN_TITLE = 'ref'; // pergunta de resposta curta preenchida pelo link pré-preenchido
var RETRY_KEY = 'ONE_RETRY_QUEUE';
var MAX_RETRY_ITEMS = 200;

function setup() {
  var form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onFormSubmitInstallable').forForm(form).onFormSubmit().create();
  ScriptApp.newTrigger('retryPending').timeBased().everyMinutes(15).create();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ONE_ENDPOINT_URL') || !props.getProperty('ONE_HMAC_SECRET')) {
    throw new Error('Defina ONE_ENDPOINT_URL e ONE_HMAC_SECRET nas Propriedades do script.');
  }
  if (props.getProperty('ONE_ENDPOINT_URL').indexOf('https://') !== 0) throw new Error('O endpoint deve usar HTTPS.');
  Logger.log('Gatilhos instalados para o formulário ' + form.getId());
}

function onFormSubmitInstallable(e) {
  var response = e.response;
  var form = FormApp.getActiveForm();
  var payload = buildPayload(form, response);
  var ok = send(payload);
  if (!ok) enqueue(payload);
}

function buildPayload(form, response) {
  var fields = { nome_contato: '', nome_empresa: '', email: '', whatsapp: '', instagram: '', servicos: '' };
  var ref = '';
  response.getItemResponses().forEach(function (ir) {
    var title = ir.getItem().getTitle().trim();
    var value = ir.getResponse();
    if (Array.isArray(value)) value = value.join(', ');
    value = String(value || '').slice(0, 1000);
    if (title === TOKEN_TITLE) { ref = value.trim(); return; }
    for (var key in FIELD_TITLES) {
      if (FIELD_TITLES[key] === title) fields[key] = value;
    }
  });
  if (!fields.email && response.getRespondentEmail()) fields.email = response.getRespondentEmail();
  return {
    event_id: form.getId() + ':' + response.getId(),
    form_id: form.getId(),
    response_id: response.getId(),
    submitted_at: response.getTimestamp().toISOString(),
    ref: ref,
    fields: fields
  };
}

function sign(secret, timestamp, body) {
  var bytes = Utilities.computeHmacSha256Signature(timestamp + '.' + body, secret, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

/** Retorna true quando o servidor aceitou ou rejeitou definitivamente (não reenviar). */
function send(payload) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('ONE_ENDPOINT_URL');
  var secret = props.getProperty('ONE_HMAC_SECRET');
  var body = JSON.stringify(payload);
  var ts = String(Math.floor(Date.now() / 1000));
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: body,
      headers: { 'X-One-Timestamp': ts, 'X-One-Signature': sign(secret, ts, body) },
      muteHttpExceptions: true,
      followRedirects: false
    });
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) return true;
    // 4xx (exceto 429) = rejeição definitiva (assinatura/payload inválidos): não insiste.
    if (code >= 400 && code < 500 && code !== 429) { console.warn('ONE CONTROL rejeitou a resposta: HTTP ' + code); return true; }
    console.warn('ONE CONTROL indisponível: HTTP ' + code);
    return false;
  } catch (err) {
    console.warn('Falha de rede: ' + err);
    return false;
  }
}

function enqueue(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var queue = JSON.parse(props.getProperty(RETRY_KEY) || '[]');
    if (queue.length < MAX_RETRY_ITEMS) queue.push({ payload: payload, attempts: 1 });
    props.setProperty(RETRY_KEY, JSON.stringify(queue));
  } finally { lock.releaseLock(); }
}

/** Reenvio periódico (idempotente no servidor graças ao event_id). */
function retryPending() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var queue = JSON.parse(props.getProperty(RETRY_KEY) || '[]');
    var remaining = [];
    queue.forEach(function (item) {
      if (!send(item.payload) && item.attempts < 48) remaining.push({ payload: item.payload, attempts: item.attempts + 1 });
    });
    props.setProperty(RETRY_KEY, JSON.stringify(remaining));
  } finally { lock.releaseLock(); }
}
