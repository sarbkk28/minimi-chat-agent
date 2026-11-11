# Design

## The problem, as I read it

The sample questions aren't really about web search. "On Monday…", "on 3 November…", "last Tuesday…" all need the agent to know **what it said, when it said it, and what has changed since**. Any agent can wrap a search API. The hard part is time: remembering past answers precisely, and re-checking them honestly.

## How it works

Every turn runs one pipeline:

```
message
  → CODE: find a date ("last Tuesday" → a real day range) and load that day's messages + fact snapshots
  → ROUTER (fast model, one call): standalone question + route + topic + search queries
       direct         "thanks!"                         no search
       search         "What does Neon cost?"            search
       recall         "What did I ask on 3 Nov?"        no search
       recall_verify  "...is that still correct?"       search, compare old vs new
  → SEARCH: all queries in parallel (Tavily general or news index), merged, deduped, with publish dates
  → ANSWER (stronger model): streamed, cited inline
  → BACKGROUND: extract facts (entity, attribute, value, source) → SQLite, timestamped
```

**Memory is two tables.** `messages` is the timestamped transcript. `facts` holds structured snapshots, like `Supabase | Pro plan price | $25/month | observed 10 Nov`. On "has pricing changed since Monday?", the facts tell the agent **which products** to re-check (one query each) and **what the baseline values** were.

## Why I built it this way

- **Code does what code is reliable at; the LLM does judgment.** Date resolution, recall lookup, days-elapsed, and JSON validation are deterministic code. Intent, query writing, and comparison are the LLM's job. "Last Tuesday" is ambiguous (yesterday or 8 days ago?), so I check both candidate days and let the data decide.
- **Two models, matched to the job.** `gpt-oss-20b` routes in ~0.4–0.8 s; `gpt-oss-120b` writes answers. Reasoning effort is `low` for normal turns and `medium` only when verifying an old answer: speed where it's cheap, care where it matters.
- **Fast to first word.** Streaming (NDJSON over `fetch`) with status lines ("Searching: neon.com pricing · …"). Searches run in parallel. Fact extraction runs after the answer, so the user never waits for it. Small talk and pure recall skip search entirely.
- **Honest by construction.** If no conversation exists on a date, the agent says so and doesn't search. "No change found" is reported as exactly that, not "nothing changed."
- **Boring, explainable stack.** Express, the `openai` SDK pointed at Groq, Node's built-in SQLite, Zod, chrono-node. No agent framework: every step is a plain function I can explain.

## What testing taught me (each was a real failure, then a fix)

| Failure I saw | Root cause | Fix |
|---|---|---|
| Said Node 24 is still the latest LTS (26 became LTS on 28 Oct) | The raw question returned stale "evergreen" pages | LLM query planner; prompt rules: *count dates, not votes* and *a "scheduled" date in the past has likely happened* |
| Repeated its own wrong answer word for word | Recent chat history included the earlier wrong reply | Recall turns get no chat history |
| Listed old features as "shipped since Monday" | No sense of the time window | Days-elapsed computed in code; only items dated after the earlier chat count as "new" |
| Tech news full of Neon/Supabase items | Router borrowed topics from earlier chat | Query condensation: rewrite to a standalone question first, decide everything from that |
| News results were trend listicles and a 2025 page | The general index ranks SEO pages above news | Router picks a news topic; news index with real publish dates |
| `better-sqlite3` failed to compile on Node 26 | Native add-on lagged the Node version | Node's built-in `node:sqlite`; nothing to compile on graders' machines |
| Configured model returned 404 | Groq retired Llama 3.3 in Aug 2026 | Model names live in `.env`, not code |

## Considered and rejected

- **Vector DB for memory.** These questions are lookups by date and by product, not by semantic similarity. Indexed SQLite is exact and simpler.
- **One big ReAct tool loop.** More round-trips, and dates are unreliable when left to the LLM. A fixed pipeline with one routing call is faster and testable.
- **Full history in every prompt.** Expensive, and it caused the anchoring bug above.
- **Server-Sent Events.** The browser's `EventSource` only supports GET; NDJSON over a POST `fetch` is the same idea with less code.
- **A paid model.** Groq's free tier was enough, and the OpenAI-compatible client makes swapping providers a config change.

## With another week

1. **Second-hop search.** The planner can't name what it doesn't know (it didn't know "Node 26" existed). Read the first results, then run a confirming search: "Node.js 26 LTS".
2. **Fetch official pages in full** for pricing checks, instead of trusting search snippets.
3. **Normalize facts** (`Launch plan compute` vs `price per CU-hour` are the same fact) so diffs can be computed in code, not by the LLM.
4. **Recency window from the router** (`day`/`week`/`month`) instead of a fixed week for news.
5. **Multi-user sessions** (memory is single-user today), plus provider fallback on rate limits.
6. **Grow the scenario suite** into a scored eval that runs in CI.