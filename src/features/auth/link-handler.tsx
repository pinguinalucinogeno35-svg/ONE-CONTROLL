"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { parseAuthFragment } from "@/lib/auth-fragment";

/**
 * Conclui links de convite/recuperação no formato padrão do Supabase (sessão no
 * fragmento da URL). Remove os tokens da barra de endereço imediatamente, cria a
 * sessão e leva à tela de definir senha. Links com token_hash seguem por /auth/confirm.
 */
export function AuthLinkHandler() {
  useEffect(() => {
    const parsed = parseAuthFragment(window.location.hash);
    if (parsed.kind === "none") return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (parsed.kind === "error") {
      window.location.replace("/recuperar-acesso?erro=link");
      return;
    }
    const fail = () => window.location.replace("/recuperar-acesso?erro=link");
    try {
      // Sem resposta em 10 s (rede instável), trata como link inválido em vez de deixar a tela parada.
      const timeout = new Promise<{ error: Error }>((resolve) => setTimeout(() => resolve({ error: new Error("timeout") }), 10_000));
      Promise.race([createClient().auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken }), timeout])
        .then(({ error }) => (error ? fail() : window.location.replace("/redefinir-senha")))
        .catch(fail);
    } catch {
      fail();
    }
  }, []);
  return null;
}
