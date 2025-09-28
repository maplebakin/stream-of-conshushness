// models/Entry.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const SuggestedTaskSchema = new Schema({
  title   : { type: String, required: true, trim: true },
  dueDate : { type: String, default: "" },  // YYYY-MM-DD
  repeat  : { type: String, default: "" },
  cluster : { type: String, default: "" },
  section : { type: String, default: "" },
  status  : { type: String, enum: ["new","accepted","dismissed"], default: "new" }
}, { _id: false });

const EntrySchema = new Schema({
  userId : { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  date   : { type: String, required: true }, // YYYY-MM-DD

  // Content
  text   : { type: String, default: "", trim: true },
  html   : { type: String, default: "" },
  content: { type: String, default: "" },    // legacy compatibility

  // Metadata
  mood   : { type: String, default: "" },
  tags   : { type: [String], default: [] },
  cluster: { type: String, default: "" },    // cluster scoping
  clusters: { type: [Schema.Types.ObjectId], ref: "Cluster", default: [] },
  section: { type: String, default: "" },    // legacy / optional
  sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null, index: true },
  pinned : { type: Boolean, default: false },

  // SectionPage room scoping
  sectionPageId: { type: Schema.Types.ObjectId, ref: "SectionPage", default: null, index: true },

  linkedGoal: { type: Schema.Types.ObjectId, ref: "Goal", default: null },

  // Ripple/task suggestions extracted from content
  suggestedTasks: { type: [SuggestedTaskSchema], default: [] },
}, { timestamps: true });

// Helpful compound indexes
EntrySchema.index({ userId: 1, cluster: 1, date: -1 });
EntrySchema.index({ userId: 1, clusters: 1, date: -1 });
EntrySchema.index({ userId: 1, sectionPageId: 1, date: -1 });
EntrySchema.index({ userId: 1, sectionId: 1, pinned: -1, date: -1 });

export default mongoose.model("Entry", EntrySchema);
