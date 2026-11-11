import * as chrono from "chrono-node";

const DAY = 24 * 60 * 60 * 1000;

// Given any moment, return the start/end of that calendar day in the USER's timezone, as UTC Dates.
// tzOffset = minutes ahead of UTC (India = 330, Seattle = -480)
function dayRange(date, tzOffset) {
  const local = new Date(date.getTime() + tzOffset * 60000);
  const startUtc =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - tzOffset * 60000;
  const start = new Date(startUtc);
  const label = new Date(startUtc + tzOffset * 60000).toLocaleDateString("en-US", {
    timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
  return { start, end: new Date(startUtc + DAY), label };
}

// Finds a past day mentioned in the text ("3 November", "last Tuesday", "on Monday").
// Returns candidate days to check, most likely first, or null if no date is mentioned.
export function resolvePastDay(text, now = new Date(), tzOffset = 0) {
  const results = chrono.parse(text, { instant: now, timezone: tzOffset });
  if (!results.length) return null;

  const r = results[0];
  let date = r.start.date();
  const weekdayOnly = r.start.isCertain("weekday") && !r.start.isCertain("day");

  // These are questions about the past: if chrono picked a future date, move it back
  if (date > now) {
    date = weekdayOnly
      ? new Date(date.getTime() - 7 * DAY) // "Monday" → last week's Monday
      : new Date(date.setFullYear(date.getFullYear() - 1)); // "3 Dec" → last year
  }

  const candidates = [dayRange(date, tzOffset)];
  // "last Tuesday" could mean this week's or last week's: check both
  if (weekdayOnly) candidates.push(dayRange(new Date(date.getTime() - 7 * DAY), tzOffset));

  return { matchedText: r.text, candidates };
}