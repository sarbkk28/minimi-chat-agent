// Inserts past-dated conversations + fact snapshots so recall can be tested today.
// Run with a fresh DB:  rm -f data/agent.db && npm run seed
import { saveMessage, saveFacts } from "../src/memory.js";

const DAY = 24 * 60 * 60 * 1000;

function lastWeekday(weekday) {
  const d = new Date();
  d.setHours(10, 0, 0, 0);
  do d.setTime(d.getTime() - DAY);
  while (d.getDay() !== weekday);
  return d;
}

function seed(createdAt, question, answer, facts = []) {
  saveMessage({ role: "user", content: question, createdAt });
  const answeredAt = new Date(createdAt.getTime() + 5000);
  saveMessage({ role: "assistant", content: answer, createdAt: answeredAt });
  saveFacts(facts, answeredAt);
}

seed(
  new Date(2026, 10, 3, 10, 0),
  "What is the latest LTS version of Node.js?",
  "The latest LTS version of Node.js is Node 24.",
  [{ entity: "Node.js", attribute: "latest LTS version", value: "Node 24" }]
);

seed(
  lastWeekday(1),
  "Shortlist 5 CRM tools for a 20-person sales team.",
  "Shortlist: HubSpot Sales Hub, Salesforce Sales Cloud, Pipedrive, Zoho CRM, and Close. All use per-seat monthly pricing.",
  ["HubSpot Sales Hub", "Salesforce Sales Cloud", "Pipedrive", "Zoho CRM", "Close"].map((entity) => ({
    entity, attribute: "pricing model", value: "per-seat monthly",
  }))
);

seed(
  lastWeekday(2),
  "Compare Postgres hosting pricing for a small startup: Neon vs Supabase.",
  "Neon Launch: usage-based, $0.106 per CU-hour and $0.35 per GB-month storage. Supabase Pro: $25/month per project.",
  [
    { entity: "Neon", attribute: "Launch plan compute", value: "$0.106 per CU-hour" },
    { entity: "Neon", attribute: "Launch plan storage", value: "$0.35 per GB-month" },
    { entity: "Supabase", attribute: "Pro plan price", value: "$25/month per project" },
  ]
);

console.log("Seeded 3 past conversations with fact snapshots.");