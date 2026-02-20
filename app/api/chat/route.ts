import { NextRequest, NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

const SYSTEM_PROMPT = `You are the Decosta Portfolio Assistant for decosta.ca.
Answer only from supplied context. Do not invent facts.
Always include source citations. If data is missing, state that it is not available in current project content.`;

type ChatPayload = {
  mode: "projects" | "experience" | "city";
  message: string;
  contextChunks?: Array<{ id: string; title: string; content: string }>;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<ChatPayload>;

  if (!body.message || !body.mode) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const modeSources: Record<ChatPayload["mode"], string[]> = {
    projects: ["project", "blog"],
    experience: ["resume", "project", "manual", "blog"],
    city: ["city"]
  };

  let contextChunks = body.contextChunks ?? [];
  if (contextChunks.length === 0) {
    try {
      const result = await dbQuery<{
        id: string;
        title: string;
        content: string;
      }>(
        `select
          c.id::text as id,
          d.title,
          c.content
        from kb_chunk c
        join kb_document d on d.id = c.document_id
        where d.status = 'published'
          and d.source_type = any($1::text[])
          and c.content ilike '%' || $2 || '%'
        order by d.updated_at desc, c.chunk_index asc
        limit 6`,
        [modeSources[body.mode], body.message.trim()]
      );
      contextChunks = result.rows;
    } catch {
      contextChunks = [];
    }
  }

  if (contextChunks.length === 0) {
    return NextResponse.json({
      answer: "I don’t have that in my current project content.",
      sources: []
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing OPENAI_API_KEY.",
        hint: "Set OPENAI_API_KEY in Vercel project environment variables."
      },
      { status: 500 }
    );
  }

  const inputContext = contextChunks
    .map((chunk) => `[${chunk.id}] ${chunk.title}\n${chunk.content}`)
    .join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Mode: ${body.mode}\n\nContext:\n${inputContext}\n\nQuestion:\n${body.message}\n\nReturn concise answer and a Sources section referencing context IDs.`
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json({ error: "OpenAI request failed", details: errText }, { status: 502 });
  }

  const json = (await response.json()) as {
    output_text?: string;
  };

  return NextResponse.json({
    answer: json.output_text ?? "No response text returned.",
    sources: contextChunks.map((chunk) => ({ id: chunk.id, title: chunk.title })),
    systemPromptVersion: "v1"
  });
}
