import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { getMasterFilePath, MASTER_FILE_NAME } from "../lib/server/master-file";

const destDir = join(process.cwd(), "public", "data");
const dest = join(destDir, MASTER_FILE_NAME);
const src = getMasterFilePath();

if (!existsSync(src)) {
  console.warn(`Skip master xlsx copy — ${MASTER_FILE_NAME} not at repo root`);
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
const sizeMb = Math.round(statSync(src).size / 1024 / 1024);
console.log(`Copied ${MASTER_FILE_NAME} → public/data/ (${sizeMb} MB)`);
