# Chat agent with web search and time-aware memory

A chat agent that answers with cited web search, remembers past conversations by date, and can tell you whether an earlier answer is still correct.

It handles questions like:

- "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"
- "What did I ask you on 3 November? Is your answer still correct today?"
- "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"

## Run it

Requires **Node.js 22.13 or newer** (it uses Node's built-in SQLite, so nothing has to compile).

```bash
cp .env.example .env    # then add your two keys
npm install
npm run dev             # open http://localhost:3000
```

| Key | Where to get it | Cost |
|---|---|---|
| `GROQ_API_KEY` | console.groq.com → API Keys | Free tier |
| `TAVILY_API_KEY` | tavily.com | Free monthly credits |

## Try the memory features

The agent only remembers conversations it has had. To test date-based recall right away, load three past-dated conversations (3 Nov, last Monday, last Tuesday):

```bash
npm run seed            # writes to data/agent.db; delete that file to start fresh
```

Then ask any of the questions above.

## Tests

```bash
npm test
```

Runs 9 end-to-end scenarios against a throwaway database (`data/test.db`): routing, recall, re-verification, follow-ups, and honesty when there's no record. They call the live APIs, so they check behavior (route, whether it searched, which products it covered), not exact wording.

## Project layout

```
src/
  server.js    HTTP only: streams agent events to the browser (NDJSON)
  agent.js     The turn pipeline: context → route → search → answer → save
  router.js    One fast LLM call: standalone question + route + topic + queries
  dates.js     "last Tuesday" → a real date range (deterministic, chrono-node)
  memory.js    SQLite: messages and fact snapshots, both timestamped
  facts.js     Extracts checkable facts from answers, in the background
  search.js    Tavily: parallel queries, merge, dedupe, publish dates
  llm.js       Groq client (OpenAI-compatible): chat, JSON, streaming
  prompts.js   All prompts in one place
  schemas.js   Zod schemas for every LLM JSON output
public/        Plain HTML/CSS/JS chat UI
tests/         seed.js, scenarios.js, debug-search.js
```

See [DESIGN.md](DESIGN.md) for how it works and why.