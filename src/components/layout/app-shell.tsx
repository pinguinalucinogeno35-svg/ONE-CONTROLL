"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, LogOut, Menu, X } from "lucide-react";
import type { NavItem } from "@/lib/permissions";
import { NAV_ICONS } from "./icons";
import { cn } from "@/lib/utils";
import { signOut } from "@/features/auth/actions";

type Props = { nav: NavItem[]; user: { name: string; roleLabel: string }; unread: number; children: React.ReactNode };

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
                <p className="mt-3 flex items-center gap-3 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  {Icon && <Icon aria-hidden className="size-4" />}{item.label}
                </p>
                <ul className="ml-3 border-l border-border pl-2">
                  {item.children.map((c) => (
                    <li key={c.href}>
                      <Link href={c.href} onClick={onNavigate} aria-current={active(c.href) ? "page" : undefined}
                        className={cn("flex min-h-10 items-center rounded-lg px-3 text-sm text-muted hover:bg-elevated hover:text-fg", active(c.href) && "bg-elevated text-fg")}>
                        {c.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Link href={item.href} onClick={onNavigate} aria-current={active(item.href) ? "page" : undefined}
                className={cn("flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted hover:bg-elevated hover:text-fg", active(item.href) && "bg-elevated text-fg")}>
                {Icon && <Icon aria-hidden className="size-4" />}{item.label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function AppShell({ nav, user, unread, children }: Props) {
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
    <div className="flex h-full flex-col">
      <div className="px-4 py-5">
        <p className="text-xs font-semibold tracking-[0.35em] text-primary">ONE</p>
        <p className="text-lg font-semibold tracking-tight">ONE CONTROL</p>
      </div>
      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-2 pb-4"><NavLinks nav={nav} onNavigate={() => setOpen(false)} /></nav>
      <div className="border-t border-border p-3">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="text-xs text-muted">{user.roleLabel}</p>
        <form action={signOut} className="mt-2">
          <button className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-sm text-muted hover:bg-elevated hover:text-fg"><LogOut aria-hidden className="size-4" />Sair</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-border bg-surface md:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button aria-label="Fechar menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[82%] max-w-xs border-r border-border bg-surface">
            <button aria-label="Fechar menu" onClick={() => setOpen(false)} className="absolute right-2 top-4 rounded-lg p-2 text-muted hover:text-fg"><X className="size-5" /></button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-4 backdrop-blur md:px-8">
          <button aria-label="Abrir menu" aria-expanded={open} onClick={() => setOpen(true)} className="-ml-2 rounded-lg p-2 text-muted hover:text-fg md:hidden"><Menu className="size-5" /></button>
          <p className="text-sm font-semibold md:hidden">ONE CONTROL</p>
          <div className="hidden md:block" />
          <Link href="/notificacoes" aria-label={`Notificações${unread ? `: ${unread} não lidas` : ""}`} className="relative rounded-lg p-2 text-muted hover:text-fg">
            <Bell className="size-5" aria-hidden />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
          </Link>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
      </div>

      <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {bottom.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined}
              className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", isActive ? "text-primary" : "text-muted")}>
              {Icon && <Icon aria-hidden className="size-5" />}{item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
