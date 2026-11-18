import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose, { type Connection } from "mongoose";

function owned(connection: Connection, uri: string) {
  const expected = new URL(uri);
  assert.equal(connection.host, expected.hostname);
  assert.equal(connection.port, Number(expected.port));
  assert.equal(connection.name, expected.pathname.slice(1));
  assert.match(connection.name, /^icheertor_resilience_disposable(?:_restored)?$/);
}

/** Fixture-only backup format. Never uses the URI configured in .env. */
export async function snapshot(connection: Connection, generatedUri: string): Promise<string> {
  owned(connection, generatedUri);
  const collections = [];
  for (const info of await connection.db!.listCollections().toArray()) {
    if (info.name.startsWith("system.")) continue;
    const collection = connection.db!.collection(info.name);
    collections.push({ name: info.name, records: await collection.find({}).toArray(), indexes: await collection.listIndexes().toArray() });
  }
  const payload = mongoose.mongo.BSON.EJSON.stringify({ database: connection.name, collections }, { relaxed: false });
  return JSON.stringify({ format: "synthetic-backup-v1", payload, sha256: crypto.createHash("sha256").update(payload).digest("hex") });
}

export async function restore(connection: Connection, generatedUri: string, backup: string): Promise<void> {
  owned(connection, generatedUri);
  assert.equal(connection.name, "icheertor_resilience_disposable_restored");
  const envelope = JSON.parse(backup);
  assert.equal(envelope.format, "synthetic-backup-v1");
  assert.equal(crypto.createHash("sha256").update(envelope.payload).digest("hex"), envelope.sha256, "Corrupted backup rejected");
  const data = mongoose.mongo.BSON.EJSON.parse(envelope.payload, { relaxed: false });
  assert.equal(data.database, "icheertor_resilience_disposable");
  assert.equal((await connection.db!.listCollections().toArray()).length, 0, "Restore target must be fresh and empty");
  for (const entry of data.collections) {
    const collection = connection.db!.collection(entry.name);
    if (entry.records.length) await collection.insertMany(entry.records);
    else await connection.db!.createCollection(entry.name);
    for (const index of entry.indexes) {
      if (index.name === "_id_") continue;
      const { key, v, ns, ...options } = index;
      await collection.createIndex(key, options);
    }
  }
}
