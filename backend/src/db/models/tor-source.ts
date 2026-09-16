import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ITORSource extends Document {
  torRecordId: Types.ObjectId;
  portalName: "bma" | "egp";
  sourceUrl: string;
  scrapedAt: Date;
  rawHtml?: string;
  structuralChangeDetected: boolean;
  createdAt: Date;
}

const TORSourceSchema = new Schema<ITORSource>(
  {
    torRecordId: {
      type: Schema.Types.ObjectId,
      ref: "TORRecord",
      required: true,
      index: true,
    },
    portalName: {
      type: String,
      required: true,
      enum: ["bma", "egp"],
    },
    sourceUrl: { type: String, required: true },
    scrapedAt: { type: Date, required: true },
    rawHtml: { type: String },
    structuralChangeDetected: { type: Boolean, default: false },
  },
  { timestamps: true },
);

TORSourceSchema.index({ portalName: 1, sourceUrl: 1 }, { unique: true });

const TORSource: Model<ITORSource> =
  mongoose.models.TORSource ||
  mongoose.model<ITORSource>("TORSource", TORSourceSchema);

export default TORSource;
