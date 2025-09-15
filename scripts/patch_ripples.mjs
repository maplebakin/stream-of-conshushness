import mongoose from 'mongoose';
const { MONGO_URI = 'mongodb://127.0.0.1:27017/stream' } = process.env;

const rippleSchema = new mongoose.Schema({
  contexts: { type: [String], default: [] }
}, { strict: false, collection: 'ripples' });

const Ripple = mongoose.model('RipplePatch', rippleSchema);

(async () => {
  await mongoose.connect(MONGO_URI);
  const cursor = Ripple.find().cursor();

  let fixed = 0, scanned = 0;
  for await (const r of cursor) {
    scanned++;
    const c = r.contexts;
    const needsFix =
      !Array.isArray(c) ||
      (Array.isArray(c) && c.some(v => typeof v !== 'string'));

    if (needsFix) {
      let next = [];
      if (Array.isArray(c)) {
        next = c.flatMap(v => (typeof v === 'string' ? [v] : []));
      }
      r.contexts = next;
      await r.save();
      fixed++;
    }
  }
  console.log(`Scanned: ${scanned}, fixed: ${fixed}`);
  await mongoose.disconnect();
  process.exit(0);
})();
