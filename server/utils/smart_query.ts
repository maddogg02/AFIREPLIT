import OpenAI from "openai";

export interface PreprocessResult {
  mode: "direct" | "expanded";
  queries: string[];
  concepts?: string[];
  categories?: string[]; // Optional category hints like ["Safety", "Facilities", "Personnel"]
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function looksLikeKeyword(query: string): boolean {
  const q = (query || "").trim();
  if (!q) return true;
  const words = q.split(/\s+/);
  const lower = q.toLowerCase();
  const questionStarters = ["what", "how", "does", "can", "should", "is", "are", "may", "might", "could", "would", "who", "where", "why", "when"];
  if (words.length <= 3 && !questionStarters.some((w) => lower.startsWith(w + " "))) return true;
  return false;
}

export async function preprocessQuery(userQuery: string): Promise<PreprocessResult> {
  // Fast-path for short, keyword-like queries
  if (looksLikeKeyword(userQuery)) {
    return { mode: "direct", queries: [userQuery] };
  }

  // Use a small LLM call to expand vague scenarios into AFI-ready search phrases
  const system = `You help Air Force QA inspectors translate vague situations into AFI-searchable phrases.
Return strict JSON with keys: concepts, search_queries, categories.
Rules:
- 3-6 concise "concepts"
- 3-6 precise "search_queries" (5-8 words each, AFI terminology preferred)
- optional "categories" drawn from: Safety, Facilities, Personnel, Training, General, Maintenance, Compliance, Admin
Do not include commentary—only valid JSON.`;

  const user = `Original user scenario/question:\n"""${userQuery}"""`;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 300,
    });
    const content = resp.choices[0]?.message?.content?.trim() || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Soft fallback with a second attempt via JSON repair prompt could be added; for now, pass-through
      return { mode: "direct", queries: [userQuery] };
    }

    const concepts: string[] = Array.isArray(parsed?.concepts) ? parsed.concepts.filter((s: any) => typeof s === "string" && s.trim()) : [];
    const queries: string[] = Array.isArray(parsed?.search_queries) ? parsed.search_queries.filter((s: any) => typeof s === "string" && s.trim()) : [];
    const categories: string[] | undefined = Array.isArray(parsed?.categories) ? parsed.categories.filter((s: any) => typeof s === "string" && s.trim()) : undefined;

    if (!queries.length) {
      return { mode: "direct", queries: [userQuery] };
    }

    return { mode: "expanded", queries, concepts, categories };
  } catch (err) {
    console.error("smart_query.preprocessQuery error:", err);
    return { mode: "direct", queries: [userQuery] };
  }
}
