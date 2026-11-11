// One Tavily search call
async function tavily(query, maxResults) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({ query, max_results: maxResults, search_depth: "basic" }),
  });
  if (!res.ok) throw new Error(`Tavily error ${res.status}: ${await res.text()}`);
  return (await res.json()).results;
}

// Runs all queries in parallel, then merges them round-robin
// (1st of each, then 2nd of each...) so every query contributes, then dedupes.
export async function webSearch(queries, { perQuery = 4, maxResults = 6 } = {}) {
  const list = Array.isArray(queries) ? queries : [queries];
  const resultLists = await Promise.all(list.map((q) => tavily(q, perQuery)));

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
    .map((r) => ({ title: r.title, url: r.url, content: r.content.slice(0, 1200) }));
}