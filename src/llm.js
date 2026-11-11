import OpenAI from "openai";

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is missing. Copy .env.example to .env and add your key.");
}

// Groq speaks the OpenAI API format, so we use the openai package pointed at Groq.
// Swapping providers = changing baseURL + model names in .env.
const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const ANSWER_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
// Router + fact extraction use a separate, smaller model. On Groq, rate limits are
// per model, so this also keeps routing from competing with answers for tokens.
const FAST_MODEL = process.env.GROQ_FAST_MODEL || "openai/gpt-oss-20b";

// Full text at once
export async function chat(messages, model = ANSWER_MODEL) {
  const res = await client.chat.completions.create({ model, messages });
  return res.choices[0].message.content;
}

// Small, fast JSON calls (router, fact extraction). JSON mode guarantees valid JSON syntax;
// Zod then checks the shape.
export async function chatJSON(messages, model = FAST_MODEL) {
  const res = await client.chat.completions.create({
    model,
    messages,
    response_format: { type: "json_object" },
    reasoning_effort: "low",
  });
  return JSON.parse(res.choices[0].message.content);
}

// gpt-oss was trained with a built-in browsing tool and occasionally tries to call it.
// Groq rejects that request ("Tool choice is none, but model called a tool").
const isStrayToolCall = (err) => /tool/i.test(err?.message ?? "");

// Streaming: yields text pieces as the model writes them (like a Python generator).
// If the model makes a stray tool call before any text was sent, retry once.
export async function* chatStream(
  messages,
  { model = ANSWER_MODEL, reasoningEffort = "low" } = {}
) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let sentAnything = false;
    try {
      const stream = await client.chat.completions.create({
        model,
        messages,
        stream: true,
        reasoning_effort: reasoningEffort,
      });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          sentAnything = true;
          yield text;
        }
      }
      return;
    } catch (err) {
      // Retry only if nothing reached the user yet; otherwise the answer would be duplicated
      if (attempt === 1 && !sentAnything && isStrayToolCall(err)) {
        console.warn("Stray tool call from model, retrying once:", err.message);
        continue;
      }
      throw err;
    }
  }
}