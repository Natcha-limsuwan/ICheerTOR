import Counter from "../db/models/rate-limit-counter.js";

/** Shared fixed-window counters. Expiry is part of the key, not dependent on TTL cleanup. */
export class MongoRateLimitStore {
  localKeys = false;
  private windowMs = 60000;
  constructor(private readonly namespace: string) {}
  init(options: { windowMs: number }): void { this.windowMs = options.windowMs; }
  private bucket(key: string) {
    const start = Math.floor(Date.now() / this.windowMs) * this.windowMs;
    return { id: `${this.namespace}:${start}:${key}`, resetTime: new Date(start + this.windowMs) };
  }
  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const { id, resetTime } = this.bucket(key);
    const update = { $inc: { hits: 1 }, $setOnInsert: { resetAt: resetTime } };
    let doc;
    try { doc = await Counter.findOneAndUpdate({ _id: id }, update, { upsert: true, returnDocument: "after" }).lean(); }
    catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      doc = await Counter.findOneAndUpdate({ _id: id }, { $inc: { hits: 1 } }, { returnDocument: "after" }).lean();
    }
    if (!doc || Array.isArray(doc)) throw new Error("Rate limit counter unavailable");
    return { totalHits: Number(doc.hits), resetTime };
  }
  async decrement(key: string): Promise<void> {
    await Counter.updateOne({ _id: this.bucket(key).id, hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }
  async resetKey(key: string): Promise<void> { await Counter.deleteOne({ _id: this.bucket(key).id }); }
}
