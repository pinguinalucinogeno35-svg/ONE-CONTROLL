# Modelo de ameaças

| Ameaça | Vetor | Defesa |
|---|---|---|
| IDOR/BOLA | Alterar id na URL/API | RLS em todas as leituras; rotinas verificam propriedade; `notFound()` para linhas invisíveis; E2E e SQL testam |
| Escalada de privilégio | UPDATE em `profiles.role` | Sem grant na coluna; trigger impede autoalteração; rotinas admin-only auditadas |
| Mass assignment | Campos extras no payload | Zod descarta; rotinas leem campos explícitos; grants por coluna |
| Manipulação de comissão (Cenário I) | `commission_rate_bps=10000` no corpo | Taxa vem da política; CHECK base×taxa; testes SQL e unitários |
| Manipulação de valores | Valor negativo/3 casas/float | Zod + `money_from_json` + CHECKs |
| Concorrência em pagamentos | Requisições paralelas | `FOR UPDATE` + verificação de saldo + chave de idempotência única (teste com 6 sessões) |
| Duplicidade de webhook/replay | Reenvio de mensagem | HMAC + janela 5 min + `integration_events` único + `form_submissions` único |
| Origem forjada no Forms | `seller_id` no formulário | Vendedor resolvido pelo hash do token; schema estrito rejeita campos extras |
| SQL injection | Entrada em filtros | PostgREST parametrizado; filtros de busca higienizados; sem SQL dinâmico com dados do usuário |
| XSS | Conteúdo de clientes | React escapa; sem `dangerouslySetInnerHTML`; CSP com nonce e `strict-dynamic` |
| CSRF | Requisições de outra origem | Server Actions validam Origin; `/api/files` exige mesma origem; cookies SameSite (Supabase) |
| Clickjacking | iframe | `frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| Brute force | Login | Rate limit por e-mail+IP e por IP + limites do Supabase Auth; mensagem genérica |
| Sessão de usuário desligado | JWT ainda válido | Status checado em toda consulta; ban no Auth |
| Upload malicioso | Executável renomeado | Magic bytes, extensão, 10 MB, bucket privado, sem execução, nomes gerados (UUID) |
| Vazamento de tokens/segredos | Logs/bundle | Segredos só no servidor (`server-only`), logger com redação, `.env` ignorado |
| Exportação indevida | Parâmetros alterados | Consultas sob RLS; relatórios admin-only checados no servidor; rate limit |
| CSV formula injection | Células `=`, `+`, `-`, `@` | `sanitizeCell` em CSV e XLSX |
| Cache de dados sensíveis | Service Worker/CDN | SW só guarda estáticos; páginas `private, no-store` |
| Perda de dados | Exclusão/erro | Sem DELETE financeiro; estornos; backups (ver operações) |

Riscos residuais: rate limit em memória por instância; ausência de antivírus no upload
(recomendado integrar verificação assíncrona); política de compensação de comissão paga
sobre recebimento estornado pendente.
