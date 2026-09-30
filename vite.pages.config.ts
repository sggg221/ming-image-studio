import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// A client-only build shares the studio UI without importing the worker server.
export default defineConfig({
  root: fileURLToPath(new URL("./pages", import.meta.url)),
  base: "/ming-image-studio/",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  define: {
    "process.env.NEXT_PUBLIC_DIRECT_API": JSON.stringify("1"),
  },
  build: {
    outDir: fileURLToPath(new URL("./dist/pages", import.meta.url)),
    emptyOutDir: true,
  },
});
