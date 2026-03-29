import { NextRequest, NextResponse } from 'next/server';
import { getStoryById, getLinksForStory, getAllStories } from '@/lib/db';
import { Story } from '@/types/story';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const story = await getStoryById(id);
    if (!story) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const links = await getLinksForStory(id);
    if (links.length === 0) {
      const all = (await getAllStories()).filter(s => s.id !== id);
      const myTopics = new Set(story.topics.map(t => t.toLowerCase()));
      const scored = all
        .map(s => {
          const shared = s.topics.filter(t => myTopics.has(t.toLowerCase()));
          return { story: s, shared, score: shared.length };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      return NextResponse.json(scored.map(x => ({ story: x.story, sharedTopics: x.shared, score: x.score })));
    }

    const allStories = await getAllStories();
    const storyMap = new Map<string, Story>(allStories.map(s => [s.id, s]));

    const related = links
      .slice(0, 5)
      .map(link => {
        const relatedId = link.fromId === id ? link.toId : link.fromId;
        return {
          story: storyMap.get(relatedId),
          sharedTopics: link.sharedTopics,
          score: link.similarityScore,
        };
      })
      .filter(r => r.story);

    return NextResponse.json(related);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
