import { describe, expect, it } from "vitest";
import { parseAuthFragment } from "@/lib/auth-fragment";

describe("links de e-mail no formato padrão do Supabase", () => {
  it("reconhece sessão de recuperação e de convite", () => {
    expect(parseAuthFragment("#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery"))
      .toEqual({ kind: "session", accessToken: "a.b.c", refreshToken: "r1", type: "recovery" });
    expect(parseAuthFragment("access_token=x&refresh_token=y&type=invite")).toMatchObject({ kind: "session", type: "invite" });
  });

  it("link expirado vira erro (sem tentar sessão)", () => {
    expect(parseAuthFragment("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid"))
      .toEqual({ kind: "error", code: "otp_expired" });
  });

  it("ignora fragmentos que não são de autenticação", () => {
    expect(parseAuthFragment("")).toEqual({ kind: "none" });
    expect(parseAuthFragment("#conteudo")).toEqual({ kind: "none" });
    expect(parseAuthFragment("#access_token=x&refresh_token=y&type=signup")).toEqual({ kind: "none" });
    expect(parseAuthFragment("#access_token=x&type=recovery")).toEqual({ kind: "none" });
  });
});
