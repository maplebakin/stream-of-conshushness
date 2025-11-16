import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

/* ───────────── MongoDB Connection ───────────── */
(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
})();

/* ───────────── Start Server ───────────── */
app.listen(PORT, () => {
  console.log(`🌿 Listening on http://localhost:${PORT}`);
});
