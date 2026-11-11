const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("input");

function addUserBubble(text) {
  const div = document.createElement("div");
  div.className = "msg user";
  div.textContent = text;
  chat.appendChild(div);
}

// Date separator between days, e.g. "Tue, Nov 3"
function addDivider(text) {
  const div = document.createElement("div");
  div.className = "divider";
  div.textContent = text;
  chat.appendChild(div);
}

// Builds an assistant bubble and returns handles to update it
function addBotBubble() {
  const bot = document.createElement("div");
  bot.className = "msg bot";
  const status = document.createElement("div");
  status.className = "status";
  const body = document.createElement("div");
  const sourcesEl = document.createElement("div");
  bot.append(status, body, sourcesEl);
  chat.appendChild(bot);

  return {
    setStatus: (t) => (status.textContent = t),
    setText: (md) => (body.innerHTML = DOMPurify.sanitize(marked.parse(md))),
    setSources: (sources) => {
      if (!sources.length) return;
      sourcesEl.className = "sources";
      sourcesEl.innerHTML = sources
        .map((s, i) => `<a href="${s.url}" target="_blank">[${i + 1}] ${s.title}</a>`)
        .join("");
    },
  };
}

const scrollDown = () => (chat.scrollTop = chat.scrollHeight);

// Formats a timestamp as the user's local day, e.g. "Tue, Nov 3"
const dayLabel = (date) =>
  date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

let lastDay = ""; // tracks the last divider shown, so new messages today don't repeat it

// On page load: redraw previous conversation from the server, with date dividers
async function loadHistory() {
  const messages = await (await fetch("/api/history")).json();

  for (const m of messages) {
    const day = dayLabel(new Date(m.created_at));
    if (day !== lastDay) {
      addDivider(day);
      lastDay = day;
    }

    if (m.role === "user") addUserBubble(m.content);
    else {
      const b = addBotBubble();
      b.setText(m.content);
      b.setSources(m.sources);
    }
  }
  scrollDown();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = "";

  // Show today's divider if this is the first message today
  const today = dayLabel(new Date());
  if (today !== lastDay) {
    addDivider(today);
    lastDay = today;
  }

  addUserBubble(message);
  const bot = addBotBubble();
  let text = "";
  let sources = [];

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // getTimezoneOffset() is -330 for India, so negate it: +330 = minutes ahead of UTC
    body: JSON.stringify({ message, tzOffset: -new Date().getTimezoneOffset() }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete last line for next chunk

    for (const line of lines) {
      if (!line) continue;
      const event = JSON.parse(line);
      if (event.type === "status") bot.setStatus(event.text);
      if (event.type === "sources") sources = event.sources;
      if (event.type === "token") {
        bot.setStatus("");
        text += event.text;
        bot.setText(text);
      }
      if (event.type === "error") bot.setStatus("Error: " + event.text);
      if (event.type === "done") bot.setSources(sources);
      scrollDown();
    }
  }
});

loadHistory();