import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DashboardDataset } from "@/lib/types";

let seedDatasetCache: DashboardDataset | null = null;

/** Baked NEW PRIMARY desk canonical book shipped with the app (~12 MB on disk). */
export function loadSeedDataset(): DashboardDataset {
  if (seedDatasetCache) return seedDatasetCache;

  const seedPath = join(process.cwd(), "lib", "data", "master-seed.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf-8")) as DashboardDataset;
  seedDatasetCache = seed;
  return seed;
}
