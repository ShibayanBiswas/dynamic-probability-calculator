import { MongoClient, type Db, type MongoClientOptions } from "mongodb";

import { isMongoConfigured, resolveMongoConfig } from "@/lib/db/mongo-config";

declare global {
  var __spMongoClient: MongoClient | undefined;
  var __spMongoConnectPromise: Promise<MongoClient> | undefined;
}

let client: MongoClient | null = null;
let connectPromise: Promise<MongoClient> | null = null;

const CLIENT_OPTIONS: MongoClientOptions = {
  serverSelectionTimeoutMS: process.env.VERCEL ? 4_000 : 8_000,
  connectTimeoutMS: process.env.VERCEL ? 4_000 : 8_000,
  socketTimeoutMS: process.env.VERCEL ? 12_000 : 30_000,
  maxPoolSize: process.env.VERCEL ? 4 : 10,
  maxIdleTimeMS: process.env.VERCEL ? 10_000 : 60_000,
  retryWrites: true,
};

export { isMongoConfigured } from "@/lib/db/mongo-config";

export async function getMongoDb(): Promise<Db | null> {
  const config = resolveMongoConfig();
  if (!config) return null;

  if (!client) {
    client = global.__spMongoClient ?? new MongoClient(config.uri, CLIENT_OPTIONS);
    global.__spMongoClient = client;
  }

  if (!connectPromise) {
    connectPromise =
      global.__spMongoConnectPromise ??
      client.connect().catch((error) => {
        connectPromise = null;
        global.__spMongoConnectPromise = undefined;
        client = null;
        global.__spMongoClient = undefined;
        throw error;
      });
    global.__spMongoConnectPromise = connectPromise;
  }

  await connectPromise;
  return client.db(config.dbName);
}

export async function pingMongo(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isMongoConfigured()) {
    return { ok: false, reason: "MONGODB_URI not set (copy .env.example → .env.local)" };
  }

  try {
    const db = await getMongoDb();
    if (!db) return { ok: false, reason: "Mongo client unavailable" };
    await db.command({ ping: 1 });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/authentication failed|auth fail/i.test(message)) {
      return {
        ok: false,
        reason:
          "Authentication failed — check MONGODB_URI credentials or MONGODB_USER / MONGODB_PASSWORD / MONGODB_AUTH_SOURCE",
      };
    }
    if (/ECONNREFUSED|Server selection timed out|connect ECONNREFUSED/i.test(message)) {
      return {
        ok: false,
        reason:
          "Cannot reach MongoDB — check Atlas network access (0.0.0.0/0) and MONGODB_URI host",
      };
    }
    return { ok: false, reason: message };
  }
}

/** Close the shared Mongo client so CLI scripts can exit. */
export async function closeMongoClient(): Promise<void> {
  const active = client ?? global.__spMongoClient;
  connectPromise = null;
  global.__spMongoConnectPromise = undefined;
  client = null;
  global.__spMongoClient = undefined;
  if (active) {
    await active.close().catch(() => undefined);
  }
}

let indexPromise: Promise<void> | null = null;

/** Create indexes once per process (idempotent, cached). */
export async function ensureMongoIndexes() {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const db = await getMongoDb();
    if (!db) return;
    await Promise.all([
      db.collection(COLLECTIONS.products).createIndex({ rowId: 1 }, { unique: true }),
      db.collection(COLLECTIONS.products).createIndex({ isin: 1 }),
      db.collection(COLLECTIONS.indexPrices).createIndex({ date: 1 }, { unique: true }),
      db.collection(COLLECTIONS.masterUploads).createIndex({ uploadedAt: -1 }),
      db.collection(COLLECTIONS.masterSheets).createIndex({ sheetName: 1 }, { unique: true }),
    ]);
  })().catch((error) => {
    indexPromise = null;
    throw error;
  });
  return indexPromise;
}

export const COLLECTIONS = {
  products: "products",
  indexPrices: "index_prices",
  masterUploads: "master_uploads",
  masterSheets: "master_sheets",
} as const;
