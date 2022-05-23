import { resolve } from "path";
import process from "process";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import wasmPack from "vite-plugin-wasm-pack";

export default defineConfig({
  build: {
    minify: false,
  },
  plugins: [
    {
      name: "configure-response-headers",
      configureServer: (server) => {
        server.middlewares.use((_req, res, next) => {
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          next();
        });
      },
    },
  ],
  // plugins: [wasmPack([resolve("../")])],
});
