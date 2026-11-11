import OpenAI from "openai";

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is missing. Copy .env.example to .env and add your key.");
}

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// Full text at once
export async function chat(messages, model = process.env.GROQ_MODEL) {
  const res = await client.chat.completions.create({ model, messages });
  return res.choices[0].message.content;
}

// Small, fast JSON calls (planner, later the router). JSON mode guarantees valid JSON syntax;
// Zod then checks the shape.
export async function chatJSON(messages, model = process.env.GROQ_FAST_MODEL || process.env.GROQ_MODEL) {
  const res = await client.chat.completions.create({
    model,
    messages,
    response_format: { type: "json_object" },
    reasoning_effort: "low",
  });
  return JSON.parse(res.choices[0].message.content);
}

// Streaming: yields text pieces as the model writes them
export async function* chatStream(
  messages,
  { model = process.env.GROQ_MODEL, reasoningEffort = "low" } = {}
) {
  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
    reasoning_effort: reasoningEffort,
  });
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}