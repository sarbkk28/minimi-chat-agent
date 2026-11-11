import { chatStream } from "./llm.js";
import { webSearch } from "./search.js";
import { answerPrompt, userToday } from "./prompts.js";
import { saveMessage, recentMessages, messagesBetween, factsBetween } from "./memory.js";
import { resolvePastDay } from "./dates.js";
import { planTurn } from "./router.js";
import { extractAndSaveFacts, formatFacts } from "./facts.js";

const DAY = 24 * 60 * 60 * 1000;

// gpt-oss sometimes writes citations as 【3†L1-L4】; normalize to [3]
const cleanCitations = (s) =>
  s.replace(/【/g, "[").replace(/】/g, "]").replace(/†[^\]\s]*/g, "");

// CODE: find a date in the message and load that day's messages + facts (deterministic)
function findDatedConversation(userMessage, tzOffset) {
  const ref = resolvePastDay(userMessage, new Date(), tzOffset);
  if (!ref) return null;
  for (const day of ref.candidates) {
    const messages = messagesBetween(day.start, day.end);
    if (messages.length) {
      return { label: day.label, start: day.start, end: day.end, messages, facts: factsBetween(day.start, day.end) };
    }
  }
  const first = ref.candidates[0];
  return { label: first.label, start: first.start, end: first.end, messages: [], facts: [] };
}

function formatPast(past) {
  if (!past.messages.length) {
    return `PAST CONVERSATION (${past.label}): No conversation found on this date.`;
  }
  const when = past.start
    ? `${past.label}, ${Math.max(1, Math.round((Date.now() - past.start.getTime()) / DAY))} day(s) ago`
    : past.label;
  const lines = past.messages.map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 1500)}`);
  const facts = past.facts.length ? `\n\nFacts recorded then:\n${formatFacts(past.facts)}` : "";
  return `PAST CONVERSATION (${when}):\n${lines.join("\n\n")}${facts}`;
}

export async function* runAgent(userMessage, { tzOffset = 0 } = {}) {
  const today = userToday(new Date(), tzOffset);
  const t0 = Date.now();
  const timing = {}; // logged once per turn, to find where time goes

  // 1. Code gathers context (before saving, so this message can't match itself)
  const dated = findDatedConversation(userMessage, tzOffset);
  const recent = recentMessages(6);
  saveMessage({ role: "user", content: userMessage });

  // 2. ONE fast LLM call: standalone rewrite + route + topic + queries
  const plan = await planTurn({ question: userMessage, today, recent, dated });
  timing.router = Date.now() - t0;

  // Guard: code backs up the LLM on what code can verify. If the user named a PAST day
  // that has a stored conversation, they're referring back to it, so "search" becomes "recall_verify".
  if (plan.route === "search" && dated?.messages.length && dated.end.getTime() <= Date.now()) {
    plan.route = "recall_verify";
  }
  // Guard: "verify" needs the user to actually ask about change or correctness.
  // "What did I ask you on 3 Nov?" has no such word, so it is pure recall (no search).
  const asksAboutChange = /\b(still|correct|accurate|true|wrong|chang|since|new|update|differ|outdated|valid)/i;
  if (plan.route === "recall_verify" && !asksAboutChange.test(userMessage)) {
    plan.route = "recall";
    plan.queries = [];
  }
  console.log(`[router] ${plan.route}/${plan.topic} | "${plan.standalone}" |`, plan.queries);
  // The UI ignores this event; tests use it to check routing decisions
  yield { type: "plan", ...plan };

  // 3. Recall routes: the dated conversation, or recent chat if no date was given
  const isRecall = plan.route === "recall" || plan.route === "recall_verify";
  const past = isRecall
    ? dated ?? { label: "earlier in this chat", start: null, messages: recent, facts: [] }
    : null;
  if (past) yield { type: "status", text: `Checking our conversation from ${past.label}…` };

  // 4. Search only when needed. Nothing to verify if no past conversation exists.
  const needsSearch =
    plan.route === "search" || (plan.route === "recall_verify" && past.messages.length > 0);

  let results = [];
  if (needsSearch) {
    yield { type: "status", text: `Searching: ${plan.queries.join(" · ")}` };
    results = await webSearch(plan.queries, {
      topic: plan.topic,
      perQuery: 3,
      maxResults: Math.max(6, plan.queries.length + 2),
    });
    timing.search = Date.now() - t0 - timing.router;
  }
  const sources = results.map(({ title, url }) => ({ title, url }));
  if (sources.length) yield { type: "sources", sources };

  // 5. Build the prompt. Recall turns get no chat history (the model would copy old answers).
  const history = past ? [] : recent.map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
  const context = results
    .map((r, i) =>
      `[${i + 1}] ${r.title}\nURL: ${r.url}${r.published ? `\nPublished: ${r.published}` : ""}\n${r.content}`)
    .join("\n\n");

  const userBlock = [
    `Question: ${userMessage}`,
    past ? formatPast(past) : null,
    results.length ? `Search results:\n${context}` : null,
  ].filter(Boolean).join("\n\n");

  yield { type: "status", text: plan.route === "recall_verify" ? "Comparing with fresh sources…" : "Writing answer…" };

  // 6. Answer: more reasoning only when verifying an old answer
  let fullReply = "";
  for await (const text of chatStream(
    [
      { role: "system", content: answerPrompt(new Date(), tzOffset) },
      ...history,
      { role: "user", content: userBlock },
    ],
    { reasoningEffort: plan.route === "recall_verify" ? "medium" : "low" }
  )) {
    if (!fullReply) {
      timing.firstToken = Date.now() - t0;
      console.log(`[timing] router=${timing.router}ms search=${timing.search ?? 0}ms firstToken=${timing.firstToken}ms`);
    }
    fullReply += text;
    yield { type: "token", text };
  }

  const answer = cleanCitations(fullReply);
  saveMessage({ role: "assistant", content: answer, sources });

  // 7. Snapshot facts in the background, only when we have sources (off the hot path)
  if (sources.length) extractAndSaveFacts({ question: userMessage, answer, sources });

  yield { type: "done" };
}