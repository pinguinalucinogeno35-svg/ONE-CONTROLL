"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, formDataToObject } from "@/server/action";
import { clientKitSchema, kitAssetSchema, uuid } from "@/lib/validation/schemas";
import type { ActionResult } from "@/server/errors";

type Prev = ActionResult<unknown> | null;

// Edição restrita no banco à administração e ao vendedor responsável pelo cliente.
export async function saveClientKitAction(clientId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "save_client_kit", commercial: true, schema: clientKitSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("save_client_kit", { p_client: uuid.parse(clientId), p: d });
    revalidatePath(`/kits/${clientId}`);
    return { error, message: "Kit salvo." };
  });
}

export async function addKitAssetAction(clientId: string, _p: Prev, fd: FormData) {
  return runAction({ name: "add_client_kit_asset", commercial: true, schema: kitAssetSchema, input: formDataToObject(fd) }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("add_client_kit_asset", { p_client: uuid.parse(clientId), p: d });
    revalidatePath(`/kits/${clientId}`);
    return { error, message: "Material adicionado." };
  });
}

export async function removeKitAssetAction(clientId: string, assetId: string, _p: Prev, _fd: FormData) {
  return runAction({ name: "remove_client_kit_asset", commercial: true, schema: z.object({ id: uuid }), input: { id: assetId } }, async (ctx, d) => {
    const { error } = await ctx.supabase.rpc("remove_client_kit_asset", { p_asset: d.id });
    revalidatePath(`/kits/${clientId}`);
    return { error };
  });
}
