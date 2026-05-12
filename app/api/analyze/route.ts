import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { PDFParse } from "pdf-parse";

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("pdf") as File;

    if (!file) {
      return NextResponse.json({ error: "No PDF uploaded" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();

    const pageCount = textResult.total;
    const documentText = textResult.pages
      .map((p) => `\n\n--- PAGE ${p.num} ---\n${p.text}`)
      .join("")
      .slice(0, 24000);

    const systemPrompt = `You are a senior legal analyst AI. Analyze the document provided and return a single JSON object.

RULES:
1. Every risk, date, and stakeholder item MUST include a page citation in the "page" field, e.g. "Page 2".
2. ONLY include information that is actually present in the document.
3. If risks, dates, or stakeholders are not found, return an empty array [] for that field.
4. keyClause must be a plain-English string — never null or empty.
5. suggestedQuestions must be exactly 3 short questions (under 10 words each) specific to THIS document's actual content.

Return this JSON structure — nothing else, no markdown, no backticks:
{
  "summary": "2-3 sentence overview",
  "risks": [{ "text": "risk description", "page": "Page X" }],
  "dates": [{ "text": "date or deadline description", "page": "Page X" }],
  "stakeholders": [{ "text": "name or role", "page": "Page X" }],
  "keyClause": "the most important clause in plain English",
  "suggestedQuestions": ["question 1", "question 2", "question 3"]
}`;

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze this document:\n\n${documentText}`,
        },
      ],
    });

    const rawText = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(rawText);

    const { suggestedQuestions, ...analysis } = parsed;

    return NextResponse.json({
      success: true,
      analysis,
      suggestedQuestions: suggestedQuestions ?? [],
      documentText,
      pageCount,
    });
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json({ error: "Failed to analyze document" }, { status: 500 });
  }
}
