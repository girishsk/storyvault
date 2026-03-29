import { NextResponse } from 'next/server';
import { getAllStories, upsertStoryLink, updateStory } from '@/lib/db';
import { computeStorySimilarity } from '@/lib/claude';

export async function POST() {
  try {
    const stories = await getAllStories();
    if (stories.length < 2) {
      return NextResponse.json({ message: 'Need at least 2 stories to analyze', linksCreated: 0 });
    }

    let linksCreated = 0;

    for (let i = 0; i < stories.length; i++) {
      const relatedIds: string[] = [];

      for (let j = i + 1; j < stories.length; j++) {
        const { score, sharedTopics } = await computeStorySimilarity(
          { title: stories[i].title, content: stories[i].content, topics: stories[i].topics },
          { title: stories[j].title, content: stories[j].content, topics: stories[j].topics }
        );

        if (score > 0.1) {
          await upsertStoryLink({
            fromId: stories[i].id,
            toId: stories[j].id,
            sharedTopics,
            similarityScore: score,
          });
          linksCreated++;
          relatedIds.push(stories[j].id);
        }
      }

      if (relatedIds.length > 0) {
        const existing = new Set(stories[i].relatedStoryIds);
        relatedIds.forEach(id => existing.add(id));
        await updateStory(stories[i].id, { relatedStoryIds: [...existing] });
      }
    }

    return NextResponse.json({ success: true, linksCreated, storiesAnalyzed: stories.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
