/**
 * Trim New Product Master_.xlsx to desk-related sheets only.
 * Keeps: Primary, Rollover, NEW PRIMARY (desk source tab).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MASTER = path.join(ROOT, "New Product Master_.xlsx");
const BACKUP = path.join(ROOT, "New Product Master_.backup.xlsx");

const KEEP_SHEETS = new Set(["Primary", "Rollover", "NEW PRIMARY"]);

function main() {
  if (!fs.existsSync(MASTER)) {
    console.error(`Master file not found: ${MASTER}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(MASTER, { cellFormula: true, cellNF: true, cellStyles: true });
  const removed = wb.SheetNames.filter((name) => !KEEP_SHEETS.has(name));
  const kept = wb.SheetNames.filter((name) => KEEP_SHEETS.has(name));

  if (removed.length === 0) {
    console.log("Nothing to trim — only desk sheets (Primary, Rollover, NEW PRIMARY) present.");
    return;
  }

  if (!fs.existsSync(BACKUP)) {
    fs.copyFileSync(MASTER, BACKUP);
    console.log(`Backup written: ${BACKUP}`);
  }

  for (const name of removed) {
    delete wb.Sheets[name];
  }
  wb.SheetNames = kept;

  XLSX.writeFile(wb, MASTER);
  console.log(`Trimmed ${removed.length} sheet(s): ${removed.join(", ")}`);
  console.log(`Kept: ${kept.join(", ")}`);
}

main();
