# StoryVault

A personal web app for capturing, visualizing, and connecting stories and passages from books. Add a story by typing it in, or photograph a page and let Claude extract the text. Each story gets AI-generated diagrams, topic tags, and automatic links to related stories in your library.

## Features

- **Add stories** — paste text manually or scan a book page with your camera/clipboard (Ctrl+V)
- **AI diagrams** — Claude picks the most fitting Mermaid diagram types (mindmap, flowchart, timeline, etc.) for each story and generates them automatically
- **Fullscreen diagram viewer** — pan, zoom (scroll or pinch), and drag; best-fit on open
- **Topic connections** — click any topic tag to see every other story that shares it
- **Related stories** — a "Related" tab shows stories linked by shared topics with similarity scoring
- **Story graph** — interactive network view of the whole library, nodes connected by shared topics
- **Inline editing** — update a story's book title and author directly from the viewer
- **Google Sheets sync** — bidirectional sync so your library lives in a spreadsheet too
- **Settings UI** — configure your Anthropic API key, Spreadsheet ID, and Google credentials from within the app (no restart needed)
- **Dark mode** — toggle between a warm antiquarian light palette and a matching dark palette; preference is saved

## Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)
- (Optional) A Google Cloud service account with Sheets API access for sync

## Quick start

```bash
cd web
npm install
cp .env.local.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Create a `.env.local` file in `web/`:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Optional — Google Sheets sync
SPREADSHEET_ID=1ABC...xyz
GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}
# or point to a file:
GOOGLE_CREDENTIALS_PATH=/path/to/service-account.json
```

All of these can also be set at runtime through the **Settings** gear in the top-right corner. Values entered there are stored in the local SQLite database and take effect immediately, without a server restart. Environment variables always take precedence over database-stored values.

## Google Sheets setup

1. Create a Google Cloud project and enable the **Sheets API**.
2. Create a **service account**, download the JSON key.
3. Share your target spreadsheet with the service account's email address (Editor role).
4. Paste the JSON content into Settings → Google Credentials, or set `GOOGLE_CREDENTIALS_JSON` in `.env.local`.
5. Enter your spreadsheet ID (the long string in the URL) in Settings → Spreadsheet ID.

Sync is bidirectional: new local stories are pushed to Sheets, and rows added directly to Sheets are pulled back into the local database.

## Data storage

All data is stored in `web/data/stories.db` (SQLite). The `data/` directory is gitignored. No data leaves your machine except:

- Story content sent to the Anthropic API for diagram generation, topic extraction, and image scanning
- Stories pushed to your own Google Sheet when you trigger a sync

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with Turbopack |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a full breakdown of the directory structure, database schema, API routes, Claude integration, theming system, and diagram viewer implementation.
