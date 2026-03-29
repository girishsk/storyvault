export interface Story {
  id: string;
  title: string;
  content: string;
  bookTitle: string;
  author: string;
  topics: string[];
  mermaidCode: string;
  diagramImagePath: string | null;
  sourceImagePath: string | null;
  relatedStoryIds: string[];
  createdAt: string;
  updatedAt: string;
  sheetsRowId: number | null;
}

export interface StoryLink {
  fromId: string;
  toId: string;
  sharedTopics: string[];
  similarityScore: number;
}

export interface StoryGraph {
  nodes: { id: string; title: string; bookTitle: string; topics: string[] }[];
  edges: { from: string; to: string; topics: string[]; score: number }[];
}
