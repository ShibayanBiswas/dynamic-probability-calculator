import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { resolveMongoConfig } from "../lib/db/mongo-config";
import { pingMongo, closeMongoClient } from "../lib/db/mongo";
import { loadProductsFromMongo } from "../lib/db/sync-master";

function loadDotEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadDotEnvLocal();

  const cfg = resolveMongoConfig();
  if (!cfg) {
    console.error("FAIL: No MongoDB config. Set MONGODB_URI in .env.local");
    process.exit(1);
  }

  const masked = cfg.uri.replace(/:([^:@/]+)@/, ":***@");
  console.log(`URI: ${masked}`);
  console.log(`DB:  ${cfg.dbName}`);

  const result = await pingMongo();
  if (!result.ok) {
    console.error(`FAIL: ${result.reason}`);
    process.exit(1);
  }

  const products = await loadProductsFromMongo();
  console.log(`OK: ping succeeded · products in DB: ${products?.length ?? 0}`);
  await closeMongoClient();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeMongoClient();
  process.exit(1);
});
