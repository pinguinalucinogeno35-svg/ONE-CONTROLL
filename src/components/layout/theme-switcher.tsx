import { Monitor, Moon, Sun } from "lucide-react";
import { setThemeAction } from "@/features/preferences/actions";
import type { ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
];

/** Alternância de tema (funciona sem JavaScript; preserva o estado da tela). */
export function ThemeSwitcher({ current }: { current: ThemePreference }) {
  return (
    <form action={setThemeAction} role="group" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-[var(--radius-control)] bg-sidebar-active p-1">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button key={value} name="theme" value={value} aria-pressed={current === value} title={`Tema ${label.toLowerCase()}`}
          className={cn("flex min-h-9 items-center justify-center gap-1.5 rounded-[var(--radius-detail)] text-xs font-medium text-sidebar-muted hover:text-sidebar-fg",
            current === value && "bg-sidebar text-sidebar-fg")}>
          <Icon aria-hidden className="size-3.5" />{label}
        </button>
      ))}
    </form>
  );
}
