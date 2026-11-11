import { z } from "zod";

// Router output. "standalone" = the message rewritten to make sense on its own;
// route/topic/queries are decided from it (query condensation).
export const TurnPlan = z.object({
  standalone: z.string().min(2),
  route: z.enum(["direct", "search", "recall", "recall_verify"]),
  topic: z.enum(["general", "news"]).default("general"),
  queries: z.array(z.string().min(2)).max(6).default([]),
});

// One checkable fact pulled out of an answer
export const Fact = z.object({
  entity: z.string().min(1),       // "Supabase"
  attribute: z.string().min(1),    // "Pro plan price"
  value: z.string().min(1),        // "$25/month per project"
  source_url: z.string().nullable().optional(),
});

export const FactList = z.object({
  facts: z.array(Fact).max(15),
});