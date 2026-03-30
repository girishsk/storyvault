import { google } from 'googleapis';
import { Story } from '@/types/story';
import { getSetting } from './db';

const SHEET_NAME = 'Stories';
const HEADERS = [
  'id', 'title', 'content', 'bookTitle', 'author', 'topics',
  'mermaidCode', 'diagramImagePath', 'sourceImagePath', 'relatedStoryIds',
  'createdAt', 'updatedAt'
];

export async function getSpreadsheetId(): Promise<string | null> {
  return process.env.SPREADSHEET_ID || await getSetting('SPREADSHEET_ID') || null;
}

async function getAuth() {
  const credentialsJson =
    process.env.GOOGLE_CREDENTIALS_JSON || await getSetting('GOOGLE_CREDENTIALS_JSON');
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH;

  if (credentialsJson) {
    const credentials = JSON.parse(credentialsJson);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  if (credentialsPath) {
    return new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  throw new Error('No Google credentials configured. Add them in Settings.');
}

function storyToRow(story: Story): string[] {
  return [
    story.id,
    story.title,
    story.content,
    story.bookTitle,
    story.author,
    JSON.stringify(story.topics),
    story.mermaidCode,
    story.diagramImagePath || '',
    story.sourceImagePath || '',
    JSON.stringify(story.relatedStoryIds),
    story.createdAt,
    story.updatedAt,
  ];
}

function rowToStory(row: string[], rowIndex: number): Story {
  return {
    id: row[0] || '',
    title: row[1] || '',
    content: row[2] || '',
    bookTitle: row[3] || '',
    author: row[4] || '',
    topics: JSON.parse(row[5] || '[]'),
    mermaidCode: row[6] || '',
    diagramImagePath: row[7] || null,
    sourceImagePath: row[8] || null,
    sourceImageRotation: 0,
    relatedStoryIds: JSON.parse(row[9] || '[]'),
    createdAt: row[10] || new Date().toISOString(),
    updatedAt: row[11] || new Date().toISOString(),
    sheetsRowId: rowIndex,
  };
}

export async function pushStoriesToSheets(stories: Story[], spreadsheetId: string): Promise<void> {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetExists = spreadsheet.data.sheets?.some(
    s => s.properties?.title === SHEET_NAME
  );

  if (!sheetExists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: SHEET_NAME } } }]
      }
    });
  }

  const values = [HEADERS, ...stories.map(storyToRow)];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

export async function pullStoriesFromSheets(spreadsheetId: string): Promise<Story[]> {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A1:Z10000`,
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) return [];

  return rows.slice(1)
    .filter(row => row[0])
    .map((row, i) => rowToStory(row.map(String), i + 2));
}

export async function appendStoryToSheets(story: Story, spreadsheetId: string): Promise<number> {
  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAME}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [storyToRow(story)] },
  });

  const updatedRange = response.data.updates?.updatedRange || '';
  const match = updatedRange.match(/(\d+)$/);
  return match ? parseInt(match[1]) : -1;
}
