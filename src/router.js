import { chatJSON } from "./llm.js";
import { QueryPlan } from "./schemas.js";
import { plannerPrompt } from "./prompts.js";

// Turns a question into 1–3 sharp search queries. Never throws:
// if the planner fails, we search the raw question (worse, but still works).
export async function planQueries(question, today) {
  try {
    const raw = await chatJSON([
      { role: "system", content: plannerPrompt(today) },
      { role: "user", content: question },
    ]);
    return QueryPlan.parse(raw).queries;
  } catch (err) {
    console.warn("Planner failed, using raw question:", err.message);
    return [question];
  }
}