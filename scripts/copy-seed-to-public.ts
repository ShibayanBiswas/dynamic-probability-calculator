import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const src = join(process.cwd(), "lib", "data", "master-seed.json");
const destDir = join(process.cwd(), "public", "data");
const dest = join(destDir, "master-seed.json");

if (!existsSync(src)) {
  console.error("Missing lib/data/master-seed.json — run: npm run bake");
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
const sizeMb = Math.round(statSync(src).size / 1024 / 1024);
console.log(`Copied master-seed.json → public/data/ (${sizeMb} MB)`);
