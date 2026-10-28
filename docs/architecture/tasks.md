# Módulo de Tarefas

Tarefas internas organizadas por **grupos** (ex.: AUDIOVISUAL, VENDAS, ADMINISTRAÇÃO), designadas a
qualquer colaborador ativo, com notificação personalizada. Independente das tarefas de projeto
(`project_tasks`, checklist dentro de cada projeto).

## Regras de acesso
| Ação | Administrador | Vendedor |
|---|---|---|
| Criar/editar/desativar grupos | Sim | Não |
| Liberar grupo para vendedores (`sellers_can_assign`) | Sim | — |
| Criar tarefa e designar | Qualquer grupo ativo, para qualquer colaborador ativo | Somente grupos liberados; para administradores ou outros vendedores |
| Ver tarefas | Todas | As que criou ou recebeu |
| Editar, reatribuir, cancelar | Qualquer tarefa | Somente as que criou |
| Atualizar andamento (iniciar, concluir, bloquear, reabrir) | Sim | Se criou ou recebeu |
| Comentar | Sim | Se criou ou recebeu |

Garantido no banco: RLS de leitura em `tasks`/`task_events`, sem INSERT/UPDATE direto, e rotinas
`create_task`, `update_task`, `set_task_status`, `comment_task`, `save_task_group` com verificação de
papel, grupo, colaborador ativo e prazo (não pode estar no passado). Bloqueio exige motivo.

## Notificações personalizadas
Geradas na mesma transação da operação (`private.notify_task`), nunca para o autor da ação:
- **Designação**: "Ana, você tem uma nova tarefa" — "Bruno designou “Editar vídeo” para você em AUDIOVISUAL · prazo 03/11/2026 · prioridade alta."
- **Reatribuição**: novo responsável recebe a designação; o anterior é avisado da transferência.
- **Status** (concluída, bloqueada, cancelada…): avisa a outra ponta (quem criou / quem executa).
- **Comentário**: avisa os participantes com o trecho do comentário.
- **Lembretes diários** (`run_task_reminders`, chamado pelo cron): prazo hoje/amanhã e atrasadas, sem duplicar no mesmo dia.
Notificações abrem a tarefa (`/tarefas/<id>`). Push/e-mail ficam para versão futura (mesma estrutura).

## Telas
`/tarefas` (Para mim · Criadas por mim · Todas [admin], filtros por grupo e situação, agrupadas por grupo) ·
`/tarefas/nova` · `/tarefas/[id]` (andamento, edição/reatribuição, histórico e comentários) ·
`/tarefas/grupos` (admin) · card "Minhas tarefas" no dashboard.

## Dados
`task_groups`, `tasks`, `task_events` (histórico append-only). Migration `20261028000014_tasks.sql`
(cria os grupos AUDIOVISUAL, VENDAS e ADMINISTRAÇÃO, editáveis). Testes: `supabase/tests/50_tasks.sql`,
`tests/unit/tasks.test.ts`.
