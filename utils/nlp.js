// utils/nlp.js
// Minimal natural-language helpers for extracting important events
// Example handled: "Colton starts school on September 2nd"

const MONTHS = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december"
];
const MONTH_ABBR = {
  jan:"january", feb:"february", mar:"march", apr:"april", may:"may", jun:"june",
  jul:"july", aug:"august", sep:"september", sept:"september", oct:"october", nov:"november", dec:"december"
};

function monthToIndex(m) {
  if (!m) return -1;
  const s = String(m).trim().toLowerCase();
  const full = MONTH_ABBR[s] || s;
  const idx = MONTHS.indexOf(full);
  return idx; // 0..11 or -1
}

// YYYY-MM-DD in America/Toronto-ish (date-only semantics)
function ymd(year, monthIndex, day) {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function chooseYearFor(monthIndex, day, base = new Date()) {
  const year = base.getFullYear();
  const candidate = new Date(year, monthIndex, day);
  // If candidate date has already passed this calendar year, roll to next year
  const today = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  return candidate >= today ? year : year + 1;
}

/**
 * extractImportantEvents(text: string, baseDate?: Date)
 * Returns: [{ title, date }]
 *
 * Heuristics:
 *   "<title> on <Month> <Day>[, <Year>]"
 *   "<title> on <MonAbbr> <Day>[, <Year>]"
 *   "<title> on <YYYY-MM-DD>"
 */
function extractImportantEvents(text, baseDate = new Date()) {
  if (!text || typeof text !== "string") return [];

  const results = [];

  // 1) "<title> on YYYY-MM-DD"
  {
    const re = /(.*?)\s+on\s+(\d{4})-(\d{2})-(\d{2})\b/i;
    const m = text.match(re);
    if (m) {
      const title = m[1].trim().replace(/\s+/g, " ");
      const y = parseInt(m[2], 10);
      const mo = parseInt(m[3], 10) - 1;
      const d = parseInt(m[4], 10);
      if (title && mo >= 0 && mo <= 11 && d >= 1 && d <= 31) {
        results.push({ title, date: ymd(y, mo, d) });
      }
    }
  }

  // 2) "<title> on Month Day[, Year]"  (handles abbr + suffixes)
  {
    const re = new RegExp(
      String.raw`(.*?)\s+on\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?\b`,
      "i"
    );
    const m = text.match(re);
    if (m) {
      const rawTitle = m[1].trim().replace(/\s+/g, " ");
      const monStr = m[2];
      const day = parseInt(m[3], 10);
      const yearStr = m[4];
      const mi = monthToIndex(monStr);
      if (rawTitle && mi >= 0 && day >= 1 && day <= 31) {
        const y = yearStr ? parseInt(yearStr, 10) : chooseYearFor(mi, day, baseDate);
        results.push({ title: rawTitle, date: ymd(y, mi, day) });
      }
    }
  }

  // De-dup within this run (same title+date)
  const unique = new Map();
  for (const ev of results) {
    const key = `${ev.title.toLowerCase()}|${ev.date}`;
    if (!unique.has(key)) unique.set(key, ev);
  }
  return Array.from(unique.values());
}

module.exports = {
  extractImportantEvents,
  ymd,
};
