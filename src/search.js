// One Tavily search call. topic "news" = recent news index, with publish dates.
async function tavily(query, maxResults, topic) {
  const body = { query, max_results: maxResults, search_depth: "basic", topic };
  if (topic === "news") body.time_range = "week"; // only recent articles

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Tavily error ${res.status}: ${await res.text()}`);
  return (await res.json()).results;
}

// Runs all queries in parallel, merges round-robin so every query contributes, then dedupes.
export async function webSearch(queries, { topic = "general", perQuery = 4, maxResults = 6 } = {}) {
  const list = Array.isArray(queries) ? queries : [queries];
  const resultLists = await Promise.all(list.map((q) => tavily(q, perQuery, topic)));

  const merged = [];
  for (let i = 0; i < perQuery; i++) {
    for (const results of resultLists) if (results[i]) merged.push(results[i]);
  }

  const seen = new Set();
  return merged
    .filter((r) => {
      if (seen.has(r.url) || seen.has(r.title)) return false;
      seen.add(r.url).add(r.title);
      return true;
    })
    .slice(0, maxResults)
    .map((r) => ({
      title: r.title,
      url: r.url,
      published: r.published_date ?? null, // real date when Tavily has one
      content: r.content.slice(0, 1200),
    }));
}