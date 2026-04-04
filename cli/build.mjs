import { build } from "esbuild";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

await build({
  entryPoints: ["cli/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  outfile: "dist/skillport.js",
  format: "esm",
  external: ["undici"],
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    "process.env.SKILLPORT_VERSION": JSON.stringify(pkg.version),
  },
  minify: false,
});

console.log("Built dist/skillport.js");
