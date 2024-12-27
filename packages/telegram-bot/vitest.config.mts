import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    plugins: [tsconfigPaths()],
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
