import { ActionButton } from "@/components/ui/server-form";
import { KIT_ASSET_KIND } from "@/lib/labels";
import type { Kit, KitAsset } from "@/server/services/kits";
import { removeKitAssetAction } from "./actions";

/** Leitura do kit: o essencial para produzir, sem dados comerciais. */
export function KitView({ clientId, kit, assets, canEdit, compact }: { clientId: string; kit: Kit | null; assets: KitAsset[]; canEdit?: boolean; compact?: boolean }) {
  if (!kit && assets.length === 0) return <p className="text-sm text-muted">O kit deste cliente ainda não foi preenchido.</p>;
  const rows: [string, string | null | undefined][] = compact
    ? [["Atividade", kit?.activity], ["Tipografia", kit?.fonts], ["Restrições", kit?.restrictions]]
    : [["Atividade", kit?.activity], ["Posicionamento", kit?.positioning], ["Público", kit?.audience], ["Tipografia", kit?.fonts],
       ["Restrições", kit?.restrictions], ["Imagem e consentimentos", kit?.image_rules], ["Orientações de aprovação", kit?.approval_notes],
       ["Contato operacional", kit?.operational_contact]];
  const groups = Object.keys(KIT_ASSET_KIND).map((k) => [k, assets.filter((a) => a.kind === k)] as const).filter(([, list]) => list.length > 0);
  return (
    <div className="flex flex-col gap-4 text-sm">
      {kit && kit.colors.length > 0 && (
        <ul className="flex flex-wrap gap-3" aria-label="Cores da marca">
          {kit.colors.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <span aria-hidden className="inline-block size-8 rounded-[var(--radius-detail)] border border-border" style={{ background: c.hex }} />
              <span><span className="block font-medium">{c.name || "Cor"}</span><span className="tabular font-mono text-xs text-muted">{c.hex.toUpperCase()}</span></span>
            </li>
          ))}
        </ul>
      )}
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className={k === "Restrições" || k === "Posicionamento" ? "sm:col-span-2" : ""}>
            <dt className="text-xs text-muted">{k}</dt><dd className={k === "Restrições" ? "whitespace-pre-line font-medium text-danger" : "whitespace-pre-line"}>{v}</dd>
          </div>
        ))}
      </dl>
      {groups.length > 0 && (
        <div className="flex flex-col gap-3">
          {groups.map(([kind, list]) => (
            <div key={kind}>
              <p className="mb-1 text-xs text-muted">{KIT_ASSET_KIND[kind]}</p>
              <ul className="flex flex-col gap-1">
                {(compact ? list.slice(0, 3) : list).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span><a href={a.url} target="_blank" rel="noopener noreferrer" className="text-link underline">{a.label}</a>{a.note && <span className="text-xs text-muted"> · {a.note}</span>}</span>
                    {canEdit && !compact && <ActionButton action={removeKitAssetAction.bind(null, clientId, a.id)} label="Remover" confirm="Remover este material do kit?" />}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
