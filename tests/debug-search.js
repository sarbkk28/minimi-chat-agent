// Shows exactly what the model sees: planned queries + search results + timings.
// Usage: node --env-file=.env tests/debug-search.js "your question"
import { webSearch } from "../src/search.js";
import { planQueries } from "../src/router.js";
import { userToday } from "../src/prompts.js";

const question = process.argv.slice(2).join(" ");
if (!question) {
  console.log('Usage: node --env-file=.env tests/debug-search.js "your question"');
  process.exit(1);
}

// 1. Planner: question → keyword queries
let t = Date.now();
const queries = await planQueries(question, userToday());
console.log(`\nPlanned queries (${Date.now() - t} ms):`, queries);

// 2. Search: all queries in parallel, merged + deduped
t = Date.now();
const results = await webSearch(queries);
console.log(`Search (${Date.now() - t} ms): ${results.length} results`);

// 3. What the answer model will read
results.forEach((r, i) => {
  console.log(`\n[${i + 1}] ${r.title}\n${r.url}\n${r.content.slice(0, 500)}`);
});