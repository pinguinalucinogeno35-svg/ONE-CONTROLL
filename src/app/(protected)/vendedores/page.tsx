import { requireAdmin } from "@/server/auth/session";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/ui/server-form";
import { InviteForm, UserRoleForm, UserStatusForm } from "@/features/users/forms";
import { revokeInvitationAction } from "@/features/users/actions";
import { PROFILE_STATUS, ROLE_LABEL, label } from "@/lib/labels";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Vendedores e usuários" };

export default async function UsersPage() {
  const ctx = await requireAdmin();
  const [users, invites] = await Promise.all([
    ctx.supabase.from("profiles").select("id, full_name, email, role, status, last_active_at, created_at").order("role").order("full_name"),
    ctx.supabase.from("user_invitations").select("id, email, full_name, intended_role, status, expires_at").eq("status", "pending").order("created_at", { ascending: false }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Equipe / Acessos" title="Vendedores e usuários" description="Acesso somente por convite. Papéis e status só mudam por rotinas administrativas auditadas." />
      <Card className="mb-6"><CardTitle className="mb-4">Convidar colaborador</CardTitle><InviteForm /></Card>
      {(invites.data ?? []).length > 0 && (
        <Card className="mb-6"><CardTitle className="mb-3">Convites pendentes</CardTitle>
          <ul className="divide-y divide-border text-sm">{invites.data!.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{i.full_name} · {i.email} · {ROLE_LABEL[i.intended_role]}</span>
              <span className="flex items-center gap-2 text-xs text-muted">expira {formatDateTime(i.expires_at)}<ActionButton action={revokeInvitationAction.bind(null, i.id)} label="Revogar" variant="danger" /></span></li>
          ))}</ul>
        </Card>
      )}
      <ul className="flex flex-col gap-3">
        {(users.data ?? []).map((u) => (
          <li key={u.id}><Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-medium">{u.full_name}</p><p className="text-xs text-muted">{u.email} · último acesso {formatDateTime(u.last_active_at)}</p></div>
              <div className="flex items-center gap-2"><Badge tone="info">{ROLE_LABEL[u.role]}</Badge><Badge tone={label(PROFILE_STATUS, u.status)[1]}>{label(PROFILE_STATUS, u.status)[0]}</Badge></div>
            </div>
            {u.id !== ctx.userId ? (
              <details className="mt-3"><summary className="cursor-pointer text-sm text-primary">Gerenciar acesso</summary>
                <div className="mt-3 grid gap-4 lg:grid-cols-2"><UserStatusForm userId={u.id} status={u.status} /><UserRoleForm userId={u.id} role={u.role} /></div>
              </details>
            ) : <p className="mt-2 text-xs text-muted">Seu próprio papel e status só podem ser alterados por outro administrador.</p>}
          </Card></li>
        ))}
      </ul>
    </>
  );
}
