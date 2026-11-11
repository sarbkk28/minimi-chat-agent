// Inserts past-dated conversations so date-based recall can be tested today.
// Run with a fresh DB:  rm -f data/agent.db && npm run seed
import { saveMessage } from "../src/memory.js";

const DAY = 24 * 60 * 60 * 1000;

// Most recent past date with this weekday (0=Sun ... 6=Sat), at 10:00 local time
function lastWeekday(weekday) {
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  do d.setTime(d.getTime() - DAY);
  while (d.getDay() !== weekday);
  return d;
}

function seed(createdAt, question, answer) {
  saveMessage({ role: "user", content: question, createdAt });
  saveMessage({ role: "assistant", content: answer, createdAt: new Date(createdAt.getTime() + 5000) });
}

// 3 November: a version question, so "is it still correct?" has something to check
seed(
  new Date(2026, 10, 3, 10, 0), // months are 0-based: 10 = November
  "What is the latest LTS version of Node.js?",
  "The latest LTS version of Node.js is Node 24."
);

// Last Monday: the CRM shortlist
seed(
  lastWeekday(1),
  "Shortlist 5 CRM tools for a 20-person sales team.",
  "Shortlist: HubSpot Sales Hub, Salesforce Sales Cloud, Pipedrive, Zoho CRM, and Close. All use per-seat monthly pricing."
);

// Last Tuesday: Postgres hosting
seed(
  lastWeekday(2),
  "Compare Postgres hosting pricing for a small startup: Neon vs Supabase.",
  "Neon Launch: usage-based, $0.106 per CU-hour and $0.35 per GB-month storage. Supabase Pro: $25/month per project."
);

console.log("Seeded 3 past conversations.");