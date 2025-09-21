import OpenAI from "openai";
import { type SearchResult } from "./chromadb_search.js";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export async function getOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts
  });
  return response.data.map(item => item.embedding);
}

export class OpenAIService {
  static async generateRAGResponse(
    userQuestion: string, 
    searchResults: SearchResult[]
  ): Promise<string> {
    try {
      // Format the retrieved AFI content for the prompt
      const afiContext = searchResults.map((result, index) => `
[AFI Source ${index + 1}]
AFI: ${result.metadata.afi_number}
Location: ${result.metadata.section_path}
Content: ${result.text}
Relevance Score: ${result.score}
`).join('\n');

      const systemPrompt = `You are an expert Air Force Instruction (AFI) assistant. Your role is to answer questions using ONLY the provided AFI content below.

CRITICAL INSTRUCTIONS:
1. Base your answer ONLY on the AFI content provided - do not use external knowledge
2. Always cite specific AFI numbers, chapters, sections, and paragraphs when referencing information
3. Format citations as: "According to [AFI Number], [Chapter/Section details]..."
4. If the provided AFI content doesn't contain sufficient information to answer the question, clearly state this limitation
5. Provide comprehensive, detailed answers when the AFI content supports it
6. Maintain professional, authoritative tone appropriate for military documentation

RETRIEVED AFI CONTENT:
${afiContext}

Provide a thorough answer to the user's question based solely on the AFI content above.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Using gpt-4o which is a proven working model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuestion }
        ],
        max_tokens: 1000, // Fixed: using max_tokens instead of max_completion_tokens
      });

      return response.choices[0].message.content || "I apologize, but I was unable to generate a response. Please try rephrasing your question.";

    } catch (error) {
      console.error("OpenAI API error:", error);
      
      // Fallback to formatted search results if OpenAI fails
      if (searchResults.length > 0) {
        let fallbackResponse = "I found the following information from the AFI documentation:\n\n";
        for (const result of searchResults) {
          fallbackResponse += `**${result.metadata.section_path}**: ${result.text.substring(0, 200)}...\n\n`;
        }
        return fallbackResponse;
      }
      
      return "I'm currently experiencing issues generating a response. Please try again later.";
    }
  }
}