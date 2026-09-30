import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The desktop renderer shares the Pages UI and calls OpenRouter directly.
export default defineConfig({
  root: fileURLToPath(new URL("./pages", import.meta.url)),
  base: "./",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  define: {
    "process.env.NEXT_PUBLIC_DIRECT_API": JSON.stringify("1"),
  },
  build: {
    outDir: fileURLToPath(new URL("./dist/desktop", import.meta.url)),
    emptyOutDir: true,
  },
});
