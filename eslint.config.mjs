import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "lib/data/**", "node_modules/**"]),
  {
    rules: {
      // Pre-existing hydration / market-sync effects; revisit when refactoring providers.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
