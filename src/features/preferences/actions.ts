"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { THEME_COOKIE, type ThemePreference } from "@/lib/theme";

/** Preferência de tema por dispositivo (não é dado sensível; cookie de 1 ano). */
export async function setThemeAction(formData: FormData) {
  const value = String(formData.get("theme") ?? "system");
  const theme: ThemePreference = value === "light" || value === "dark" ? value : "system";
  (await cookies()).set(THEME_COOKIE, theme, {
    path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
