# Setor de Produção no ONE CONTROL — plano de implantação

Decisão da ONE (03/11/2026): construir o setor de produção **do zero dentro do ONE CONTROL**, usando os
documentos "ONE OS — Revisão Profissional v1" e "Integração ONE Control + Dashboard" como especificação.
O repositório antigo do Dashboard não será integrado (dados dele não são migrados).

Decisões confirmadas:
1. Papel novo **Produção** (`production`): sem área comercial, comissões ou financeiro.
2. A produção vê **apenas os clientes dos trabalhos atribuídos a ela** (kit do cliente, sem dados comerciais).
3. Backup: migrar o Supabase para plano pago antes do piloto (ação da ONE).

## Fases (cada uma com migration aditiva, testes SQL + unitários + E2E e documentação)
| Fase | Entrega | Situação |
|---|---|---|
| 1 | Papel Produção + bloqueio comercial no banco e no app (migration 0017) | IMPLEMENTADO e aplicado no banco definitivo (03/11, conferido) |
| 2 | Perfil de trabalho e primeiro acesso curto: função como **preferência visual**, disponibilidade (presencial/remoto/externo), ausências (migration 0018; telas Meu perfil, Primeiro acesso, Equipe) | IMPLEMENTADO e aplicado no banco definitivo (03/11, conferido) |
| 3 | **Trabalhos**: ficha única por categoria (carrossel, foto, filmagem, edição, web, administrativo), responsáveis, prazo original × vigente, materiais/links, estados simples, bloqueio com motivo, revisão sem autocertificação (migration 0019; telas Trabalhos, Novo trabalho, Ficha; "Meus trabalhos" no início) | IMPLEMENTADO (LOCAL/CI); aplicar no banco definitivo |
| 4 | **Versões, revisão e aprovação**: prévia por versão, ajustes localizados (slide, foto, minutagem), aprovação da versão exata, entrega final ≠ publicação | A FAZER |
| 5 | **Kit do cliente**: marca, cores, fontes, materiais e restrições; visível para quem tem trabalho atribuído no cliente | A FAZER |
| 6 | **Calendário e sessões**: captação/foto/entrega/ausências; sessão compartilhada por várias pessoas | A FAZER |
| 7 | **Gestão**: aprovações pendentes, atrasos, bloqueios e capacidade (sem métricas decorativas) | A FAZER |
| 8 | Piloto com 2 a 4 colaboradores e ajustes | A FAZER |

Regras permanentes: profissão não limita o tipo de trabalho nem concede acesso; nenhum recurso de IA na
interface; aprovação humana; migrations sempre aditivas; nada é marcado como concluído sem teste real.
