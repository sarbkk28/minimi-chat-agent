// End-to-end scenario tests: seeded multi-day history + live LLM and search calls.
// Run: npm test
//
// Uses a throwaway database (data/test.db), so your real chat history is untouched.
// These hit real APIs, so answers vary run to run. Checks target BEHAVIOR
// (route chosen, search skipped or run, products covered, no invented memory),
// not exact wording.
import { rmSync } from "node:fs";

process.env.DB_PATH = "data/test.db";
rmSync(process.env.DB_PATH, { force: true });

// Import AFTER setting DB_PATH, so every module opens the test database
await import("./seed.js"); // seeds 3 Nov, last Monday, last Tuesday
const { runAgent } = await import("../src/agent.js");

const tzOffset = -new Date().getTimezoneOffset();

// Free-tier Groq allows ~8,000 tokens/minute per model. Back-to-back test turns exceed that
// (a human chatting doesn't), so pause between scenarios. Set PAUSE_MS=0 on a paid key.
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 10000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(`Models: answer=${process.env.GROQ_MODEL}  fast=${process.env.GROQ_FAST_MODEL ?? "(missing! falls back to answer model)"}`);

// Runs one turn and collects everything the agent emitted
async function ask(message) {
  const start = Date.now();
  let firstToken = null;
  const turn = { plan: null, sources: [], answer: "" };

  for await (const event of runAgent(message, { tzOffset })) {
    if (event.type === "plan") turn.plan = event;
    if (event.type === "sources") turn.sources = event.sources;
    if (event.type === "token") {
      if (firstToken === null) firstToken = Date.now() - start;
      turn.answer += event.text;
    }
  }
  turn.firstTokenMs = firstToken;
  turn.totalMs = Date.now() - start;
  return turn;
}

const mentions = (text, words) => words.filter((w) => text.toLowerCase().includes(w.toLowerCase()));

// Each scenario: a message, then checks that return true/false
const scenarios = [
  {
    name: "Small talk skips search",
    message: "thanks!",
    checks: {
      "route is direct": (t) => t.plan.route === "direct",
      "no web search": (t) => t.sources.length === 0,
    },
  },
  {
    name: "Pure recall (3 Nov) skips search",
    message: "What did I ask you on 3 November?",
    checks: {
      "route is recall": (t) => t.plan.route === "recall",
      "no web search": (t) => t.sources.length === 0,
      "recalls the Node.js question": (t) => /node/i.test(t.answer),
    },
  },
  {
    name: "Recall + verify catches a stale answer (Node 24 → 26)",
    message: "What did I ask you on 3 November? Is your answer still correct today?",
    checks: {
      "route is recall_verify": (t) => t.plan.route === "recall_verify",
      "searched the web": (t) => t.sources.length > 0,
      "mentions Node 26": (t) => /\b26\b/.test(t.answer),
    },
  },
  {
    name: "No conversation on that date: honest, no junk search",
    message: "What did I ask you on 1 October?",
    checks: {
      "no web search": (t) => t.sources.length === 0,
      "says there is no record": (t) =>
        /\b(no|not|don't|didn't|doesn't|couldn't|can't|cannot)\b[^.]*\b(record|conversation|chat|history|messages?)\b/i.test(t.answer.replace(/[\u2018\u2019]/g, "'")), // curly → straight apostrophes
    },
  },
  {
    name: "CRM shortlist from Monday: every product re-checked",
    message:
      "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?",
    checks: {
      "route is recall_verify": (t) => t.plan.route === "recall_verify",
      "one query per product (>= 4 queries)": (t) => t.plan.queries.length >= 4,
      "answer covers >= 4 of the 5 CRMs": (t) =>
        mentions(t.answer, ["HubSpot", "Salesforce", "Pipedrive", "Zoho", "Close"]).length >= 4,
    },
  },
  {
    name: "Postgres pricing from last Tuesday",
    message: "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?",
    checks: {
      "route is recall_verify": (t) => t.plan.route === "recall_verify",
      "covers Neon and Supabase": (t) => mentions(t.answer, ["Neon", "Supabase"]).length === 2,
    },
  },
  {
    name: "Plain search",
    message: "What does Neon cost?",
    checks: {
      "route is search": (t) => t.plan.route === "search",
      "searched the web": (t) => t.sources.length > 0,
    },
  },
  {
    name: "Follow-up is resolved from context",
    message: "what about Supabase?",
    checks: {
      "standalone names Supabase": (t) => /supabase/i.test(t.plan.standalone),
      "queries target Supabase": (t) => t.plan.queries.some((q) => /supabase/i.test(q)),
    },
  },
  {
    name: "New topic is NOT polluted by earlier chat",
    message: "What's in the tech news today?",
    checks: {
      "uses the news index": (t) => t.plan.topic === "news",
      "no Neon/Supabase in queries": (t) => !t.plan.queries.some((q) => /neon|supabase/i.test(q)),
    },
  },
];

// ---------- run ----------
let passed = 0;
let failed = 0;

for (const [i, s] of scenarios.entries()) {
  if (i > 0 && PAUSE_MS) await sleep(PAUSE_MS);
  console.log(`\n▶ ${s.name}\n  "${s.message}"`);
  let turn;
  try {
    turn = await ask(s.message);
  } catch (err) {
    console.log(`  ✗ crashed: ${err.message}`);
    failed += Object.keys(s.checks).length;
    continue;
  }

  console.log(
    `  route=${turn.plan.route}/${turn.plan.topic}  sources=${turn.sources.length}  ` +
      `first token=${turn.firstTokenMs}ms  total=${turn.totalMs}ms`
  );
  let anyFailed = false;
  for (const [label, check] of Object.entries(s.checks)) {
    const ok = check(turn);
    ok ? passed++ : failed++;
    if (!ok) anyFailed = true;
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  }
  // On failure, show what the agent actually said: evidence, not guesses
  if (anyFailed) {
    console.log(`  queries: ${JSON.stringify(turn.plan.queries)}`);
    console.log(`  answer: ${turn.answer.slice(0, 400).replace(/\n+/g, " ")}…`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;