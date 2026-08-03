import type { DashboardDataset } from "@/lib/types";

const DB_NAME = "sp-dashboard";
const DB_VERSION = 3;
const STORE = "datasets";
const DATASET_KEY = "master-v3";
const META_KEY = "master-meta-v3";

/** Bump when the baked seed shape changes — stale IndexedDB rows are dropped on load. */
export const DATASET_CACHE_REVISION = 7;

type DatasetMeta = {
  revision: number;
  workbookName: string;
  productCount: number;
  savedAt: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const request = run(store);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      }),
  );
}

/** Drop legacy browser caches from older desk builds. */
export async function clearLegacyBrowserCaches(): Promise<void> {
  if (typeof localStorage !== "undefined") {
    for (const key of [
      "sp-dashboard-dataset-v2",
      "sp-dashboard-dataset-v3",
      "sp-dashboard-dataset-v4",
      "sp-dashboard-product-selection-v1",
    ]) {
      localStorage.removeItem(key);
    }
  }

  try {
    await runTransaction("readwrite", (store) => {
      store.delete("master-v2");
      return store.delete("master-meta-v2");
    });
  } catch {
    /* best-effort */
  }
}

/** Persist the full parsed master book (~12 MB) — survives page reloads. */
export async function saveDatasetToBrowser(dataset: DashboardDataset): Promise<void> {
  const meta: DatasetMeta = {
    revision: DATASET_CACHE_REVISION,
    workbookName: dataset.workbookName,
    productCount: dataset.products.length,
    savedAt: new Date().toISOString(),
  };
  await runTransaction("readwrite", (store) => {
    store.put(meta, META_KEY);
    return store.put(dataset, DATASET_KEY);
  });
}

export async function loadDatasetFromBrowser(): Promise<DashboardDataset | null> {
  try {
    const meta = await loadDatasetMetaFromBrowser();
    if (!meta || meta.revision !== DATASET_CACHE_REVISION) {
      await clearDatasetFromBrowser();
      return null;
    }

    const value = await runTransaction<DashboardDataset | undefined>("readonly", (store) =>
      store.get(DATASET_KEY),
    );
    return value ?? null;
  } catch {
    return null;
  }
}

/** Browser cache metadata — used to prefer user uploads over baked seed on reload. */
export async function loadDatasetMetaFromBrowser(): Promise<DatasetMeta | null> {
  try {
    const meta = await runTransaction<DatasetMeta | undefined>("readonly", (store) => store.get(META_KEY));
    if (!meta || meta.revision !== DATASET_CACHE_REVISION) return null;
    return meta;
  } catch {
    return null;
  }
}

export async function clearDatasetFromBrowser(): Promise<void> {
  try {
    await runTransaction("readwrite", (store) => {
      store.delete(META_KEY);
      return store.delete(DATASET_KEY);
    });
  } catch {
    /* best-effort */
  }
}

/** One-time migration from localStorage v4 when it still fits (~5 MB cap). */
export async function migrateLegacyLocalStorageDataset(
  storageKey: string,
): Promise<DashboardDataset | null> {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const dataset = JSON.parse(raw) as DashboardDataset;
    await saveDatasetToBrowser(dataset);
    localStorage.removeItem(storageKey);
    return dataset;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}
