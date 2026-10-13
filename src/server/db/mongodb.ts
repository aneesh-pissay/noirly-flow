import mongoose from "mongoose";

function resolveFlowDbName(uri: string): string | undefined {
  try {
    const normalized = uri.replace(/^mongodb(\+srv)?:/i, "http:");
    const pathname = new URL(normalized).pathname.replace(/^\//, "");
    const name = pathname.split("/")[0];
    const isAtlas = /mongodb\+srv:|\.mongodb\.net/i.test(uri);
    if (isAtlas && (!name || name === "test")) return "noirly-flow";
    return name || undefined;
  } catch {
    return /mongodb\+srv:|\.mongodb\.net/i.test(uri) ? "noirly-flow" : undefined;
  }
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var flowMongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global.flowMongooseCache ?? {
  conn: null,
  promise: null,
};

global.flowMongooseCache = cache;

export async function connectMongo(): Promise<typeof mongoose> {
  if (cache.conn) {
    return cache.conn;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required (use database name noirly-flow)");
  }

  if (!cache.promise) {
    const dbName = resolveFlowDbName(uri);
    cache.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      maxPoolSize: 10,
      ...(dbName ? { dbName } : {}),
    });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  await connectMongo();
  return fn();
}
