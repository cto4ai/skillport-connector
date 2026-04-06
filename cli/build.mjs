import { build } from "esbuild";
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// Git-derived version: <base>-<commitCount>.<shortSha>
// e.g. 3.0.0-42.af6a286 — unique per commit, ordered by commit count
// Note: this is NOT standard semver (where pre-release sorts below release).
// Our isNewer() in update.ts treats higher commit counts as newer.
const commitCount = execSync("git rev-list HEAD --count", { encoding: "utf8" }).trim();
const shortSha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
const version = `${pkg.version}-${commitCount}.${shortSha}`;

await build({
  entryPoints: ["cli/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  outfile: "dist/skillport.js",
  format: "cjs",
  external: ["child_process", "fs"],
  banner: {
    js: "#!/usr/bin/env node",
  },
  define: {
    "process.env.SKILLPORT_VERSION": JSON.stringify(version),
  },
  minify: false,
});

// Write version to file so deploy:cli can read it without recomputing
writeFileSync("dist/cli-version.txt", version);

console.log(`Built dist/skillport.js (v${version})`);
