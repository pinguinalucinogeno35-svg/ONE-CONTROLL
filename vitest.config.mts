import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": r("./src"), "server-only": r("./tests/unit/server-only-stub.ts") } },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
