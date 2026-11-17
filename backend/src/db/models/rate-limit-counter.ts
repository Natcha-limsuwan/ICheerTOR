import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  _id: { type: String, required: true },
  hits: { type: Number, required: true },
  resetAt: { type: Date, required: true },
});
schema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.models.RateLimitCounter || mongoose.model("RateLimitCounter", schema);
