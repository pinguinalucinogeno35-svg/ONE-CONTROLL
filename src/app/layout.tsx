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
  themeColor: "#080B12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2">
          Ir para o conteúdo
        </a>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
