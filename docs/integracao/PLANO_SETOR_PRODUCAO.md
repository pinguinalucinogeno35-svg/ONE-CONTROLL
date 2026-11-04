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
| 3 | **Trabalhos**: ficha única por categoria (carrossel, foto, filmagem, edição, web, administrativo), responsáveis, prazo original × vigente, materiais/links, estados simples, bloqueio com motivo, revisão sem autocertificação (migration 0019; telas Trabalhos, Novo trabalho, Ficha; "Meus trabalhos" no início) | IMPLEMENTADO e aplicado no banco definitivo (03/11, conferido) |
| 4 | **Versões, revisão e aprovação**: prévia por versão, ajustes localizados (slide, foto, minutagem) que viram itens a resolver, aprovação da versão exata (nova versão não herda aprovação), conclusão com entrega final (migration 0020) | IMPLEMENTADO e aplicado no banco definitivo (03/11, conferido) |
| 5 | **Kit do cliente**: marca, cores, fontes, materiais (links) e restrições; leitura para quem tem trabalho no cliente, edição pela administração e pelo vendedor do cliente; resumo na ficha do trabalho (migration 0021; tela /kits/[cliente]) | IMPLEMENTADO e aplicado no banco definitivo (04/11, conferido) |
| 6 | **Calendário e sessões**: sessão única com vários participantes e trabalhos ligados (T12), conflitos de agenda como aviso, calendário semanal com sessões, prazos e ausências, tela da sessão para o celular (T13) (migration 0022; telas /calendario) | IMPLEMENTADO e aplicado no banco definitivo (04/11, conferido) |
| 7 | **Gestão**: painel no Início da administração com aprovações pendentes (versão, quem revisa, desde quando), entregas em risco (atrasadas, bloqueadas, aguardando material — com o motivo), próximas sessões (com conflitos) e carga de cada pessoa × disponibilidade informada nos próximos 7 dias; sem métricas decorativas (migration 0023, `management_panel`) | IMPLEMENTADO e aplicado no banco definitivo (04/11, conferido) |
| 8 | Piloto com 2 a 4 colaboradores e ajustes (guia do colaborador: `Guia_piloto_Producao_ONE_CONTROL.pdf`) | A FAZER |

Regras permanentes: profissão não limita o tipo de trabalho nem concede acesso; nenhum recurso de IA na
interface; aprovação humana; migrations sempre aditivas; nada é marcado como concluído sem teste real.
