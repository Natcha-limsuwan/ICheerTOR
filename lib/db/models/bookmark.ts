import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IBookmark extends Document {
  userId: Types.ObjectId;
  torRecordId: Types.ObjectId;
  reminderSent: {
    submission: boolean;
    publicHearing: boolean;
  };
  notes?: string;
  createdAt: Date;
}

const BookmarkSchema = new Schema<IBookmark>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    torRecordId: {
      type: Schema.Types.ObjectId,
      ref: "TORRecord",
      required: true,
      index: true,
    },
    reminderSent: {
      submission: { type: Boolean, default: false },
      publicHearing: { type: Boolean, default: false },
    },
    notes: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

// Prevent duplicate bookmarks
BookmarkSchema.index({ userId: 1, torRecordId: 1 }, { unique: true });

const Bookmark: Model<IBookmark> =
  mongoose.models.Bookmark ||
  mongoose.model<IBookmark>("Bookmark", BookmarkSchema);

export default Bookmark;
