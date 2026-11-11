import { chatStream } from "./llm.js";
import { webSearch } from "./search.js";
import { answerPrompt, userToday } from "./prompts.js";
import { saveMessage, recentMessages, messagesBetween } from "./memory.js";
import { resolvePastDay } from "./dates.js";
import { planQueries } from "./router.js";

// gpt-oss sometimes writes citations as 【3†L1-L4】; normalize to [3]
const cleanCitations = (s) =>
  s.replace(/【/g, "[").replace(/】/g, "]").replace(/†[^\]\s]*/g, "");

function recallPastConversation(userMessage, tzOffset) {
  const ref = resolvePastDay(userMessage, new Date(), tzOffset);
  if (!ref) return null;
  for (const day of ref.candidates) {
    const messages = messagesBetween(day.start, day.end);
    if (messages.length) return { label: day.label, messages };
  }
  return { label: ref.candidates[0].label, messages: [] };
}

function formatPast(past) {
  if (!past.messages.length) {
    return `PAST CONVERSATION (${past.label}): No conversation found on this date.`;
  }
  const lines = past.messages.map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 1500)}`);
  return `PAST CONVERSATION (${past.label}):\n${lines.join("\n\n")}`;
}

export async function* runAgent(userMessage, { tzOffset = 0 } = {}) {
  // 1. Recall (before saving, so today's message can't match itself)
  const past = recallPastConversation(userMessage, tzOffset);

  // 2. History only on normal turns (on recall turns the model would copy old answers)
  const history = past
    ? []
    : recentMessages(6).map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));

  saveMessage({ role: "user", content: userMessage });
  if (past) yield { type: "status", text: `Checking our conversation from ${past.label}…` };

  // 3. Plan queries from the OLD question if found, else the current one
  const oldQuestion = past?.messages.find((m) => m.role === "user")?.content;
  const queries = await planQueries(oldQuestion || userMessage, userToday(new Date(), tzOffset));

  // 4. Search all planned queries in parallel. Showing them builds user trust.
  yield { type: "status", text: `Searching: ${queries.join(" · ")}` };
  const results = await webSearch(queries);
  const sources = results.map(({ title, url }) => ({ title, url }));
  yield { type: "sources", sources };
  yield { type: "status", text: past ? "Comparing with fresh sources…" : "Writing answer…" };

  const context = results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
    .join("\n\n");

  const userBlock = [
    `Question: ${userMessage}`,
    past ? formatPast(past) : null,
    `Search results:\n${context}`,
  ].filter(Boolean).join("\n\n");

  // 5. Answer: more reasoning when verifying an old answer, fast otherwise
  let fullReply = "";
  for await (const text of chatStream(
    [
      { role: "system", content: answerPrompt(new Date(), tzOffset) },
      ...history,
      { role: "user", content: userBlock },
    ],
    { reasoningEffort: past ? "medium" : "low" }
  )) {
    fullReply += text;
    yield { type: "token", text };
  }

  saveMessage({ role: "assistant", content: cleanCitations(fullReply), sources });
  yield { type: "done" };
}