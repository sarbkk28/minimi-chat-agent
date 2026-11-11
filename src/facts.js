import { chatJSON } from "./llm.js";
import { FactList } from "./schemas.js";
import { extractPrompt } from "./prompts.js";
import { saveFacts } from "./memory.js";

// Pulls checkable facts out of an answer and saves them.
// Runs AFTER the reply is sent (not awaited), so the user never waits for it.
export async function extractAndSaveFacts({ question, answer, sources }) {
  if (!sources.length || answer.length < 40) return; // nothing worth snapshotting

  const sourceList = sources.map((s, i) => `[${i + 1}] ${s.url}`).join("\n");
  try {
    const raw = await chatJSON([
      { role: "system", content: extractPrompt() },
      { role: "user", content: `QUESTION: ${question}\n\nANSWER:\n${answer}\n\nSOURCES:\n${sourceList}` },
    ]);
    const { facts } = FactList.parse(raw);
    if (facts.length) saveFacts(facts);
    console.log(`Saved ${facts.length} facts`);
  } catch (err) {
    console.warn("Fact extraction failed (answer unaffected):", err.message);
  }
}

// Formats stored facts for the answer model
export function formatFacts(facts) {
  return facts
    .map((f) => `- ${f.entity} | ${f.attribute}: ${f.value}${f.source_url ? ` (source: ${f.source_url})` : ""}`)
    .join("\n");
}