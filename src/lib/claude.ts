import Anthropic from '@anthropic-ai/sdk';
import { getSetting } from './db';

async function getClient(): Promise<Anthropic> {
  const apiKey = process.env.ANTHROPIC_API_KEY || await getSetting('ANTHROPIC_API_KEY') || undefined;
  return new Anthropic({ apiKey });
}

export async function extractStoryFromImage(imageBuffer: Buffer, mediaType: string): Promise<{
  title: string;
  content: string;
  bookTitle: string;
  author: string;
}> {
  const client = await getClient();
  const base64 = imageBuffer.toString('base64');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 },
        },
        {
          type: 'text',
          text: `Extract the story or passage from this image. Return JSON with:
{
  "title": "a concise title for this story/passage",
  "content": "the full extracted text content",
  "bookTitle": "book title if visible, otherwise empty string",
  "author": "author name if visible, otherwise empty string"
}
Only return the JSON, no other text.`,
        },
      ],
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const json = text.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(json);
}

export async function generateMermaidDiagram(title: string, content: string): Promise<string> {
  const client = await getClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Create a Mermaid diagram that visually represents the key elements, flow, or structure of this story.

Story Title: ${title}
Story Content: ${content}

Requirements:
- Use mindmap, flowchart, or sequence diagram (pick the most appropriate)
- Capture the key concepts, characters, or sequence of events
- Keep it clear and readable (max 15 nodes)
- Return ONLY the mermaid diagram code, starting with the diagram type (e.g., "mindmap" or "graph TD" or "sequenceDiagram")
- No markdown code fences, no explanation`,
    }],
  });

  return response.content[0].type === 'text' ? response.content[0].text.trim() : '';
}

export async function extractTopics(title: string, content: string): Promise<string[]> {
  const client = await getClient();
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Extract 3-7 key topics/themes from this story. Return only a JSON array of short topic strings (2-4 words each).

Title: ${title}
Content: ${content}

Example: ["human psychology", "decision making", "leadership", "trust"]
Return only the JSON array, no other text.`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
  const json = text.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(json);
}

export async function computeStorySimilarity(
  story1: { title: string; content: string; topics: string[] },
  story2: { title: string; content: string; topics: string[] }
): Promise<{ score: number; sharedTopics: string[] }> {
  const topics1 = new Set(story1.topics.map(t => t.toLowerCase()));
  const topics2 = new Set(story2.topics.map(t => t.toLowerCase()));
  const sharedTopics = [...topics1].filter(t => topics2.has(t));
  const jaccardScore = sharedTopics.length / (topics1.size + topics2.size - sharedTopics.length || 1);

  return {
    score: Math.min(jaccardScore * 2, 1),
    sharedTopics,
  };
}

export interface DiagramResult {
  type: string;
  label: string;
  code: string;
}

const DIAGRAM_MENU = `
- mindmap        → Concept map of themes and key ideas
- flowchart       → Cause-effect, decision flow, process steps
- sequenceDiagram → Interactions or dialogue between entities over time
- stateDiagram-v2 → State transitions (before/after, phase changes)
- erDiagram       → Relationships between key concepts/entities
- journey         → Character or reader journey through the story
- timeline        → Chronological sequence of events
- pie             → Proportional breakdown (e.g. character traits, themes)
- quadrantChart   → 2×2 positioning of concepts (e.g. impact vs effort)
`.trim();

async function selectDiagramTypes(title: string, content: string): Promise<{ type: string; label: string }[]> {
  const client = await getClient();
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Pick the 2 best Mermaid diagram types for this story from the list below. Return ONLY a JSON array of 2 objects, no other text.

Available types:
${DIAGRAM_MENU}

Story Title: ${title}
Story Content: ${content}

Return format (exactly 2 items, do NOT include mindmap):
[{"type":"flowchart","label":"Cause & Effect"},{"type":"timeline","label":"Timeline"}]`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
  const json = text.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(json);
}

async function generateSingleDiagram(title: string, content: string, type: string): Promise<string> {
  const client = await getClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `Generate a ${type} Mermaid diagram for this story. Return ONLY the raw Mermaid code — no markdown fences, no explanation, no JSON.

Story Title: ${title}
Content: ${content}

Rules:
- Start directly with the diagram type keyword (e.g. "mindmap", "graph TD", "timeline", etc.)
- Max 15 nodes, keep it readable
- Node labels must be SHORT — max 30 characters each. Abbreviate or paraphrase if needed. Never truncate mid-word.
- Valid Mermaid syntax only`,
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
}

export async function selectAndGenerateDiagrams(title: string, content: string): Promise<DiagramResult[]> {
  const selected = await selectDiagramTypes(title, content);
  const allTypes: { type: string; label: string }[] = [
    { type: 'mindmap', label: 'Concept Map' },
    ...selected.slice(0, 2),
  ];

  const results = await Promise.allSettled(
    allTypes.map(async ({ type, label }) => {
      const code = await generateSingleDiagram(title, content, type);
      return { type, label, code } as DiagramResult;
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<DiagramResult> => r.status === 'fulfilled')
    .map(r => r.value);
}
