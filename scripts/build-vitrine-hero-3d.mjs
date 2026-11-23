import { statSync } from "node:fs";
import path from "node:path";
import { build } from "rolldown";

const ROOT = process.cwd();
const ENTRY = path.join(ROOT, "scripts", "vitrine-hero-3d-src.mjs");
const OUTFILE = path.join(ROOT, "public", "h-site-final-20k", "hero-3d.min.js");

await build({
  input: ENTRY,
  output: {
    file: OUTFILE,
    format: "iife",
    minify: true,
    sourcemap: false,
  },
  treeshake: true,
});

const bytes = statSync(OUTFILE).size;
console.log(
  `Scènes 3D Pixar bundlées : ${path.relative(ROOT, OUTFILE)} (${(bytes / 1024).toFixed(1)} Ko brut)`,
);
