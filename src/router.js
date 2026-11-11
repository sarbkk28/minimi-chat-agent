import { chatJSON } from "./llm.js";
import { TurnPlan } from "./schemas.js";
import { routerPrompt } from "./prompts.js";

const NEEDS_QUERIES = new Set(["search", "recall_verify"]);

// One fast call decides the route, the search topic, AND writes search queries.
// `dated` = past conversation found by code from a date in the message (or null).
// Never throws: on failure we fall back to a plain search, the safest default.
export async function planTurn({ question, today, recent = [], dated = null }) {
  const lines = [`Latest message: ${question}`];

  if (recent.length) {
    const chat = recent
      .slice(-4)
      .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 300)}`)
      .join("\n");
    lines.push(`Recent chat (for resolving follow-ups):\n${chat}`);
  }

  if (dated?.messages.length) {
    const oldQ = dated.messages.find((m) => m.role === "user")?.content;
    lines.push(`Earlier conversation found (${dated.label}). Earlier question: ${oldQ}`);
    const entities = [...new Set(dated.facts.map((f) => f.entity))];
    if (entities.length) lines.push(`Products/entities to re-check: ${entities.join(", ")}`);
  } else if (dated) {
    lines.push(`The message mentions ${dated.label}, but no conversation exists on that day.`);
  }

  try {
    const raw = await chatJSON([
      { role: "system", content: routerPrompt(today) },
      { role: "user", content: lines.join("\n\n") },
    ]);
    const plan = TurnPlan.parse(raw);
    // Safety net: a searching route must have at least one query
    if (NEEDS_QUERIES.has(plan.route) && !plan.queries.length) plan.queries = [question];
    return plan;
  } catch (err) {
    console.warn("Router failed, defaulting to search:", err.message);
    return { route: "search", topic: "general", queries: [question] };
  }
}