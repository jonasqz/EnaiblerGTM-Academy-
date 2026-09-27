import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "drizzle/**",
    "next-env.d.ts",
    // Claude Code's agent worktrees: whole copies of the repository.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
