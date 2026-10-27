import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Server Actions têm assinatura fixa (prev, formData); parâmetros com "_" são intencionais.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  { ignores: [".next/**", "node_modules/**", "scripts/google-forms/**", "playwright-report/**", "next-env.d.ts"] },
];
export default config;
