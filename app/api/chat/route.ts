import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { question, documentText } = await req.json();

    if (!question || !documentText) {
      return NextResponse.json({ error: "Missing question or document" }, { status: 400 });
    }

    const systemPrompt = `You are a precise legal document assistant.

STRICT RULES:
1. Answer ONLY based on the provided document — never use outside knowledge
2. ALWAYS cite the page number like this: [Page X]
3. If the answer is not in the document, respond: "This information is not found in the provided document."
4. Keep answers concise: 2-4 sentences maximum
5. Use plain English — no legal jargon unless quoting directly

Document content is below. Base ALL answers strictly on it.`;

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `DOCUMENT:\n${documentText}\n\n---\nQUESTION: ${question}`,
        },
      ],
    });

    const answer = response.choices[0]?.message?.content ?? "";

    return NextResponse.json({ success: true, answer });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: "Failed to get answer" }, { status: 500 });
  }
}
