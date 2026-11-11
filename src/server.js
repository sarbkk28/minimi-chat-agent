import express from "express";
import { runAgent } from "./agent.js";
import { allMessages } from "./memory.js";

const app = express();
app.use(express.json());
app.use(express.static("public")); // serves index.html, style.css, app.js

// Past messages, so the UI can redraw the chat on page load
app.get("/api/history", (req, res) => {
  res.json(allMessages());
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  // User's timezone as minutes ahead of UTC (India = 330), sent by the browser
  const tzOffset = Number(req.body.tzOffset) || 0;

  // Stream one JSON object per line (NDJSON) as each event happens
  res.setHeader("Content-Type", "application/x-ndjson");

  try {
    for await (const event of runAgent(message.trim(), { tzOffset })) {
      res.write(JSON.stringify(event) + "\n");
    }
  } catch (err) {
    console.error(err);
    res.write(JSON.stringify({ type: "error", text: err.message }) + "\n");
  }
  res.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));