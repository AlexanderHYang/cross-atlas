import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig({
    build: {
        target: "esnext",
    },
    plugins: [basicSsl()],
    resolve: {
        alias: {
            "@": "/src",
        },
    },
    root: ".",
    publicDir: "public",
});
