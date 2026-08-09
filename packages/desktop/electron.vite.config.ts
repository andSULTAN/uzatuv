import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// electron-vite: main + preload (Node/CJS) va renderer (browser/ESM) ni
// bitta config bilan quradi. Node modullar (net, crypto) faqat main/preload'da.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      // renderer.root'ni o'zgartirganimiz uchun outDir'ni aniq belgilaymiz,
      // aks holda main'dagi loadFile("../renderer/index.html") yo'li mos kelmaydi.
      outDir: resolve(__dirname, "out/renderer"),
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") },
      },
    },
  },
});
