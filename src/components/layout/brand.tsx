/**
 * Assinatura de marca do ONE CONTROL.
 * O manual v1.0 (p. 3–4) registra que o arquivo mestre do logo ainda não foi
 * incorporado e proíbe redesenhar/vetorizar a marca. Até a entrega do master,
 * "ONE" é texto identificador em Space Grotesk 700 (como no estudo da p. 17).
 * Substitua o conteúdo deste componente pelo SVG original quando disponível.
 */
export function BrandMark({ subtitle = "Gestão corporativa", size = "md", tone = "inherit" }: { subtitle?: string; size?: "md" | "lg"; tone?: "inherit" | "sidebar" }) {
  return (
    <div className={tone === "sidebar" ? "text-sidebar-fg" : undefined}>
      <p className={size === "lg" ? "font-display text-[40px] font-bold leading-[44px] tracking-[-0.02em]" : "font-display text-[28px] font-bold leading-8 tracking-[-0.02em]"}>
        ONE
      </p>
      <p className={tone === "sidebar" ? "eyebrow mt-1 text-sidebar-muted" : "eyebrow mt-1 text-muted"}>{subtitle}</p>
    </div>
  );
}
