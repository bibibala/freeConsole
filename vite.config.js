import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
    root: ".",
    build: {
        outDir: "dist",
        rollupOptions: {
            input: {
                background: resolve(__dirname, "src/background.js"),
                content: resolve(__dirname, "src/content.js"),
                "page-injector": resolve(__dirname, "src/page-injector.js"),
                test: resolve(__dirname, "index.html"),
            },

            output: {
                entryFileNames: () => {
                    return "[name].js";
                },
                chunkFileNames: "[name].js",
                assetFileNames: "[name][extname]",
            },
            external: [],
        },
        minify: "esbuild",
        sourcemap: false,
        manifest: false,
    },
    publicDir: false,
    plugins: [
        {
            name: "copy-assets",
            apply: "build",
            async closeBundle() {
                const fs = require("fs");
                const path = require("path");

                // 确保dist目录存在
                const distDir = resolve(__dirname, "dist");
                if (!fs.existsSync(distDir)) {
                    fs.mkdirSync(distDir, { recursive: true });
                }

                // 复制manifest.json
                const manifestSrc = resolve(__dirname, "src/manifest.json");
                const manifestDest = resolve(__dirname, "dist/manifest.json");
                if (fs.existsSync(manifestSrc)) {
                    fs.copyFileSync(manifestSrc, manifestDest);
                }

                // 复制icons目录
                const iconsDir = resolve(__dirname, "src/icons");
                const outputIconsDir = resolve(__dirname, "dist/icons");

                if (fs.existsSync(iconsDir)) {
                    if (!fs.existsSync(outputIconsDir)) {
                        fs.mkdirSync(outputIconsDir, { recursive: true });
                    }
                    fs.readdirSync(iconsDir).forEach((file) => {
                        const srcPath = path.join(iconsDir, file);
                        const destPath = path.join(outputIconsDir, file);
                        fs.copyFileSync(srcPath, destPath);
                    });
                }
            },
        },
    ],
    server: {
        open: {
            app: { name: "google chrome" },
        },
        fs: {
            allow: ["."],
        },
    },
});
