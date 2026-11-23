import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "public", "h-site-final-20k");
const DEST = path.join(ROOT, "propositions-site", "h-site-final-20k");

if (!existsSync(SRC)) {
  console.error(`Source introuvable : ${SRC}`);
  process.exit(1);
}

if (existsSync(DEST)) {
  rmSync(DEST, { recursive: true, force: true });
}
cpSync(SRC, DEST, { recursive: true });

const files = readdirSync(DEST);
console.log(
  `Miroir vitrine synchronisé (${files.length} entrées) : public/h-site-final-20k -> propositions-site/h-site-final-20k`,
);
