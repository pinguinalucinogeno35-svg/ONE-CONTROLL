import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/layout/sw-register";

export const metadata: Metadata = {
  title: { default: "ONE CONTROL", template: "%s · ONE CONTROL" },
  description: "Gestão corporativa da ONE Studio Digital",
  applicationName: "ONE CONTROL",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "ONE CONTROL", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F6F4EF" }, { media: "(prefers-color-scheme: dark)", color: "#0B0B0F" }],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary">
          Ir para o conteúdo
        </a>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
