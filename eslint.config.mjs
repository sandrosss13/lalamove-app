import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

// Resolve the directory of this config file so FlatCompat can locate the
// Next.js shareable configs relative to the project root (required by the
// eslintrc-style resolver that eslint-config-next still relies on).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

export default tseslint.config(
  {
    ignores: [
      "next-env.d.ts",
      "node_modules/**",
      "dist/**",
      "build/**",
      ".next/**",
      ".cache/**",
      "coverage/**",
      ".claude/**",
      ".agents/**",
      ".ds-sync/**",
      "ds-bundle/**",
      "UI:UX/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Bring in Next.js' recommended rules (Core Web Vitals + TypeScript) via the
  // compatibility layer, since eslint-config-next ships as an eslintrc config.
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
);
