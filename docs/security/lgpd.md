# Privacidade e LGPD

## Dados tratados
- Clientes: nome do contato, empresa, e-mail, WhatsApp, Instagram, site, CNPJ/CPF (opcional), descrição.
- Colaboradores: nome, e-mail, telefone, papel, registros de acesso.
- Financeiros: cobranças, pagamentos, comissões (vinculados a contratos).

## Princípios aplicados
| Princípio | Implementação |
|---|---|
| Finalidade/necessidade | Formulário coleta só o necessário; CNPJ não obrigatório |
| Transparência | Aviso de privacidade no Google Forms (texto sugerido abaixo) |
| Segurança | RLS, MFA, criptografia em trânsito (HTTPS) e em repouso (Supabase), auditoria |
| Minimização | Payload bruto do formulário não guarda token; expurgado em 90 dias (`purge_form_payloads`) |
| Controle de acesso | Vendedor só vê a própria carteira |
| Responsabilização | `audit_logs` imutável, consultas LGPD auditadas |

## Direitos do titular
- **Acesso/confirmação**: Configurações → "LGPD — consulta por titular" (e-mail/WhatsApp), auditado.
- **Correção**: edição do cadastro (auditada para campos sensíveis via rotinas).
- **Eliminação**: não há exclusão física automática. Avaliar caso a caso: dados ligados a
  contratos, cobranças e comissões têm base legal de retenção (obrigações fiscais/contratuais,
  exercício regular de direitos). Para leads sem relação contratual, o encarregado pode
  anonimizar via SQL administrativo documentado em ata.

## Retenção sugerida (validar com o jurídico/contador)
| Dado | Prazo |
|---|---|
| Payload bruto do Forms | 90 dias (automático) |
| Leads sem contrato | 24 meses sem interação → anonimizar |
| Contratos, cobranças, pagamentos, comissões | ≥ 5 anos após o encerramento |
| Auditoria | ≥ 5 anos |

## Texto sugerido para o formulário
> Os dados informados serão usados pela ONE Studio Digital exclusivamente para contato comercial
> e elaboração de proposta, com acesso restrito à equipe responsável. Você pode solicitar acesso,
> correção ou exclusão pelo e-mail <privacidade@…>. Saiba mais em <link da política de privacidade>.

Referência: orientações da ANPD (https://www.gov.br/anpd/). Nomear um encarregado (DPO) e manter
registro das operações de tratamento é responsabilidade da ONE.
