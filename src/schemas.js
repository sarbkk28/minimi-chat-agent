import { z } from "zod";

// Shape we require from the query planner. Like a Pydantic model:
// if the LLM returns anything else, .parse() throws and we fall back.
export const QueryPlan = z.object({
  queries: z.array(z.string().min(2)).min(1).max(3),
});