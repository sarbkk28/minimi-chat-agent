// Shows the router's decision + what the answer model would see.
// Usage:
//   node --env-file=.env tests/debug-search.js "your question"
//   node --env-file=.env tests/debug-search.js "follow-up" --after "previous question"
import { webSearch } from "../src/search.js";
import { planTurn } from "../src/router.js";
import { userToday } from "../src/prompts.js";

// --after "previous question" simulates recent chat, to test follow-up handling
const args = process.argv.slice(2);
const afterIdx = args.indexOf("--after");
const question = (afterIdx > -1 ? args.slice(0, afterIdx) : args).join(" ");
const recent = afterIdx > -1 ? [{ role: "user", content: args[afterIdx + 1] }] : [];

if (!question) {
  console.log('Usage: node --env-file=.env tests/debug-search.js "question" [--after "previous question"]');
  process.exit(1);
}

// 1. Router: standalone rewrite + route + topic + queries
let t = Date.now();
const plan = await planTurn({ question, today: userToday(), recent });
console.log(`\nStandalone: "${plan.standalone}"`);
console.log(`Route: ${plan.route} | Topic: ${plan.topic} (${Date.now() - t} ms)`);
console.log("Queries:", plan.queries);

// 2. Search (only if the route needs it), using the router's topic
if (plan.queries.length) {
  t = Date.now();
  const results = await webSearch(plan.queries, { topic: plan.topic });
  console.log(`Search (${Date.now() - t} ms): ${results.length} results`);
  results.forEach((r, i) =>
    console.log(`\n[${i + 1}] ${r.title} (${r.published ?? "no date"})\n${r.url}\n${r.content.slice(0, 300)}`)
  );
}