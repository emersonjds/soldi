import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: [
        "src/shared/**",
        "src/entities/**",
        "src/features/**",
        "src/widgets/**",
        "src/app/page.tsx",
        "src/app/(app)/**",
        "src/app/(auth)/**",
      ],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts"],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
