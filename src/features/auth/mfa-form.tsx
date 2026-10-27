"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Alert, Button, Field, Input } from "@/components/ui";

type Mode = { kind: "loading" } | { kind: "enroll"; factorId: string; qr: string; secret: string } | { kind: "challenge"; factorId: string };

/** MFA TOTP do Supabase Auth: cadastro (QR code) ou desafio do fator existente. */
export function MfaForm({ next, mustEnroll }: { next: string; mustEnroll: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error: e } = await supabase.auth.mfa.listFactors();
      if (e) { setError("Não foi possível carregar a verificação."); return; }
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) { setMode({ kind: "challenge", factorId: verified.id }); return; }
      if (!mustEnroll) { router.replace(next); return; }
      // Remove cadastros incompletos antes de iniciar um novo.
      for (const f of data.all.filter((x) => x.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `ONE CONTROL ${new Date().toISOString().slice(0, 10)}` });
      if (enrollError || !enrolled) { setError("Não foi possível iniciar o cadastro do autenticador."); return; }
      setMode({ kind: "enroll", factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    })();
  }, [mustEnroll, next, router]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (mode.kind === "loading") return;
    setBusy(true); setError(null);
    const supabase = createClient();
    const { data: challenge, error: ce } = await supabase.auth.mfa.challenge({ factorId: mode.factorId });
    if (ce || !challenge) { setBusy(false); setError("Falha ao gerar desafio. Tente novamente."); return; }
    const { error: ve } = await supabase.auth.mfa.verify({ factorId: mode.factorId, challengeId: challenge.id, code: code.trim() });
    setBusy(false);
    if (ve) { setError("Código inválido ou expirado."); return; }
    router.replace(next);
    router.refresh();
  }

  if (mode.kind === "loading") return error ? <Alert tone="danger">{error}</Alert> : <p role="status" className="text-sm text-muted">Carregando…</p>;

  return (
    <form onSubmit={verify} className="flex flex-col gap-4">
      {mode.kind === "enroll" && (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted">Administradores precisam de verificação em duas etapas. Escaneie o QR code com um aplicativo autenticador (Google Authenticator, 1Password, Authy…).</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mode.qr} alt="QR code para cadastrar o autenticador" width={180} height={180} className="rounded-lg bg-white p-2" />
          <p className="text-xs text-muted">Ou digite a chave: <code className="break-all text-fg">{mode.secret}</code></p>
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <Field id="code" label="Código de 6 dígitos">
        <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required />
      </Field>
      <Button type="submit" disabled={busy || code.length !== 6}>{busy ? "Verificando…" : "Verificar"}</Button>
    </form>
  );
}
