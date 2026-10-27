"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, LogOut, Menu, X } from "lucide-react";
import type { NavItem } from "@/lib/permissions";
import { NAV_ICONS } from "./icons";
import { cn } from "@/lib/utils";
import { signOut } from "@/features/auth/actions";
import { BrandMark } from "./brand";

type Props = {
  nav: NavItem[]; user: { name: string; roleLabel: string }; unread: number;
  theme?: "light" | "dark"; themeSwitcher: React.ReactNode; children: React.ReactNode;
};

const itemBase =
  "relative flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px] text-sidebar-muted transition-colors duration-[var(--one-duration-fast)] hover:bg-sidebar-active hover:text-sidebar-fg";
const itemActive =
  "bg-sidebar-active text-sidebar-fg before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-accent";

function NavLinks({ nav, onNavigate }: { nav: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <ul className="flex flex-col gap-0.5">
      {nav.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        return (
          <li key={item.href}>
            {item.children?.length ? (
              <>
                <p className="eyebrow mt-5 mb-1 px-3 text-sidebar-muted">{item.label}</p>
                <ul className="flex flex-col gap-0.5">
                  {item.children.map((c) => {
                    const CIcon = NAV_ICONS[c.icon];
                    return (
                      <li key={c.href}>
                        <Link href={c.href} onClick={onNavigate} aria-current={active(c.href) ? "page" : undefined} className={cn(itemBase, active(c.href) && itemActive)}>
                          {CIcon && <CIcon aria-hidden strokeWidth={1.75} className="size-[18px]" />}{c.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <div className="mb-3" />
              </>
            ) : (
              <Link href={item.href} onClick={onNavigate} aria-current={active(item.href) ? "page" : undefined} className={cn(itemBase, active(item.href) && itemActive)}>
                {Icon && <Icon aria-hidden strokeWidth={1.75} className="size-[18px]" />}{item.label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function AppShell({ nav, user, unread, theme, themeSwitcher, children }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const bottom = nav.filter((n) => ["/dashboard", "/clientes", "/contratos", "/comissoes"].includes(n.href));

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="px-6 pt-7 pb-6"><BrandMark tone="sidebar" /></div>
      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 pb-4"><NavLinks nav={nav} onNavigate={() => setOpen(false)} /></nav>
      <div className="flex flex-col gap-3 border-t border-sidebar-border p-4">
        {themeSwitcher}
        <div>
          <p className="truncate text-sm font-semibold text-sidebar-fg">{user.name}</p>
          <p className="eyebrow mt-0.5 text-sidebar-muted">{user.roleLabel}</p>
        </div>
        <form action={signOut}>
          <button className="flex min-h-10 w-full items-center gap-2 rounded-[var(--radius-control)] px-2 text-sm text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-fg">
            <LogOut aria-hidden strokeWidth={1.75} className="size-4" />Sair
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div data-theme={theme} className="min-h-dvh bg-bg text-fg md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden bg-sidebar md:block"><div className="sticky top-0 h-dvh">{sidebar}</div></aside>

      {open && (
        <div className="fixed inset-0 z-[var(--one-z-dialog)] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button aria-label="Fechar menu" className="absolute inset-0 bg-overlay" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[84%] max-w-xs shadow-[var(--one-shadow)]">
            <button aria-label="Fechar menu" onClick={() => setOpen(false)} className="absolute right-3 top-6 z-10 rounded-[var(--radius-control)] p-2 text-sidebar-muted hover:text-sidebar-fg"><X className="size-5" /></button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-[var(--one-z-fixed)] flex h-14 items-center justify-between border-b border-border bg-bg/95 px-5 backdrop-blur md:h-16 md:px-8">
          <button aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)} className="-ml-2 rounded-[var(--radius-control)] p-2.5 text-muted hover:text-fg md:hidden"><Menu className="size-5" /></button>
          <p className="font-display text-lg font-bold md:hidden">ONE</p>
          <div className="hidden md:block" />
          <Link href="/notificacoes" aria-label={`Notificações${unread ? `: ${unread} não lidas` : ""}`} className="relative rounded-[var(--radius-control)] p-2.5 text-muted hover:bg-elevated hover:text-fg">
            <Bell className="size-5" strokeWidth={1.75} aria-hidden />
            {unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] font-semibold leading-5 text-on-primary">{unread > 99 ? "99+" : unread}</span>}
          </Link>
        </header>
        {/* Margens do grid: 20 px (≤ 639), 24 px (640–1023), 32 px (≥ 1024); conteúdo máx. 1280 px. */}
        <main id="conteudo" className="mx-auto w-full max-w-[var(--container-content)] flex-1 scroll-mt-20 px-5 pb-28 pt-8 sm:px-6 md:pb-12 lg:px-8">{children}</main>
      </div>

      <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-[var(--one-z-fixed)] grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {bottom.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined}
              className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium", isActive ? "text-link" : "text-muted")}>
              {Icon && <Icon aria-hidden strokeWidth={1.75} className="size-5" />}{item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
