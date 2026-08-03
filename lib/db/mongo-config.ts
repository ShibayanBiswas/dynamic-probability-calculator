/**
 * Resolves MongoDB connection settings from env.
 * Supports either MONGODB_URI or MONGODB_HOST + optional auth parts.
 */
export type MongoConfig = {
  uri: string;
  dbName: string;
};

function encodeCredential(value: string) {
  return encodeURIComponent(value);
}

export function resolveMongoConfig(): MongoConfig | null {
  const dbName = process.env.MONGODB_DB?.trim() || "sp_dashboard";
  const directUri = process.env.MONGODB_URI?.trim();

  if (directUri) {
    return { uri: directUri, dbName };
  }

  const host = process.env.MONGODB_HOST?.trim();
  if (!host) return null;

  const user = process.env.MONGODB_USER?.trim();
  const password = process.env.MONGODB_PASSWORD ?? "";
  const authSource = process.env.MONGODB_AUTH_SOURCE?.trim();

  const credentials =
    user != null && user.length > 0
      ? `${encodeCredential(user)}:${encodeCredential(password)}@`
      : "";

  const params = new URLSearchParams();
  params.set("retryWrites", "true");
  params.set("w", "majority");
  if (authSource) params.set("authSource", authSource);
  if (process.env.MONGODB_TLS === "true") params.set("tls", "true");

  const query = params.toString();
  const useSrv = process.env.MONGODB_SRV === "true" || host.includes(".mongodb.net");
  const scheme = useSrv ? "mongodb+srv" : "mongodb";
  const port =
    !useSrv && process.env.MONGODB_PORT?.trim() ? `:${process.env.MONGODB_PORT.trim()}` : "";
  const uri = `${scheme}://${credentials}${host}${port}/${dbName}?${query}`;

  return { uri, dbName };
}

export function isMongoConfigured() {
  return resolveMongoConfig() != null;
}
