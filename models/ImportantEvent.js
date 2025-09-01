// ESM model — ImportantEvent (date-only marker)
// Fields: userId, date (YYYY-MM-DD), title, description, cluster?, entryId?, pinned?

import mongoose from "mongoose";
const { Schema } = mongoose;

const ImportantEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date:   { type: String, required: true }, // YYYY-MM-DD (Toronto-normalized)
    title:  { type: String, default: "" },
    description: { type: String, default: "" }, // aka "details" in some callers
    cluster: { type: String },
    entryId: { type: Schema.Types.ObjectId, ref: "Entry" },
    pinned: { type: Boolean, default: false },   // 🔥 new
  },
  { timestamps: true }
);

// Fast lookups for a user's events by day and pinned flags
ImportantEventSchema.index({ userId: 1, date: 1 });
ImportantEventSchema.index({ userId: 1, pinned: 1, date: 1 });

export default mongoose.models?.ImportantEvent ||
  mongoose.model("ImportantEvent", ImportantEventSchema);
