# StoryVault — Architecture

## Overview

StoryVault is a Next.js 16 app (App Router, Turbopack) that runs entirely on localhost. The frontend is React 19 with inline CSS-in-JS styles and CSS custom properties for theming. The backend is Next.js API routes backed by a SQLite database. There is no external persistence — everything lives in `web/data/`.

```
Browser
  └── Next.js App Router (React 19)
        ├── API routes  →  SQLite (better-sqlite3)
        ├── API routes  →  Anthropic API (claude-sonnet-4-6 / haiku-4-5)
        └── API routes  →  Google Sheets API (optional)
```

---

## Directory structure

```
web/
├── src/
│   ├── app/
│   │   ├── page.tsx               # Root page — story grid, header, tabs
│   │   ├── globals.css            # CSS custom properties (antiquarian palette)
│   │   ├── layout.tsx             # HTML shell
│   │   └── api/
│   │       ├── stories/           # CRUD + random + related + diagrams
│   │       │   ├── route.ts       # GET (list/filter), POST (create)
│   │       │   ├── random/        # GET random story
│   │       │   └── [id]/
│   │       │       ├── route.ts   # GET, PATCH, DELETE
│   │       │       ├── related/   # GET related stories
│   │       │       ├── diagram/   # GET single legacy diagram
│   │       │       └── diagrams/  # GET cached multi-diagram, POST regenerate
│   │       ├── analyze/           # POST — compute and store story links
│   │       ├── graph/             # GET — graph nodes + edges for viz
│   │       ├── scan/              # POST — image → story via Claude vision
│   │       ├── settings/          # GET status flags, POST save settings
│   │       ├── sync/              # POST — bidirectional Google Sheets sync
│   │       └── files/             # Static file serving for images/diagrams
│   ├── components/
│   │   ├── StoryViewer.tsx        # Detail panel: Story / Mindmap / Related tabs
│   │   ├── StoryCard.tsx          # Grid card (normal + compact)
│   │   ├── StoryGraph.tsx         # React Flow network graph
│   │   ├── AddStoryModal.tsx      # Add story — manual text or image scan
│   │   ├── SettingsModal.tsx      # API key / Sheets config UI
│   │   ├── MermaidDiagram.tsx     # Inline Mermaid renderer (theme-aware)
│   │   └── DiagramViewer.tsx      # Fullscreen pan/zoom diagram modal
│   ├── lib/
│   │   ├── db.ts                  # SQLite access layer
│   │   ├── claude.ts              # Anthropic API helpers
│   │   ├── sheets.ts              # Google Sheets read/write helpers
│   │   └── mermaid-render.ts      # Server-side Mermaid utilities (if used)
│   └── types/
│       └── story.ts               # Story, StoryLink, StoryGraph interfaces
├── data/                          # SQLite DB and uploaded files (gitignored)
├── .env.local                     # Local secrets (gitignored)
├── package.json
└── tsconfig.json
```

---

## Database schema

Four tables in `data/stories.db`:

### `stories`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID v4 |
| `title` | TEXT | |
| `content` | TEXT | Markdown |
| `book_title` | TEXT | |
| `author` | TEXT | |
| `topics` | TEXT | JSON array of strings |
| `mermaid_code` | TEXT | Legacy single-diagram field |
| `diagram_image_path` | TEXT | Nullable |
| `source_image_path` | TEXT | Uploaded scan image, nullable |
| `related_story_ids` | TEXT | JSON array of IDs |
| `created_at` | TEXT | ISO 8601 |
| `updated_at` | TEXT | ISO 8601 |
| `sheets_row_id` | INTEGER | Row index in Google Sheet, nullable |

### `story_links`

| Column | Type | Notes |
|--------|------|-------|
| `from_id` | TEXT | FK → stories.id |
| `to_id` | TEXT | FK → stories.id |
| `shared_topics` | TEXT | JSON array |
| `similarity_score` | REAL | Jaccard-based, 0–1 |

Populated by `POST /api/analyze`. Used by `GET /api/stories/[id]/related` and `GET /api/graph`.

### `story_diagrams`

| Column | Type | Notes |
|--------|------|-------|
| `story_id` | TEXT | FK → stories.id |
| `type` | TEXT | Mermaid diagram type |
| `label` | TEXT | Human-readable label |
| `code` | TEXT | Raw Mermaid code |

PK is `(story_id, type)`. Acts as a cache — re-generated on demand via `POST /api/stories/[id]/diagrams`.

### `settings`

| Column | Type |
|--------|------|
| `key` | TEXT PK |
| `value` | TEXT |

Stores `ANTHROPIC_API_KEY`, `SPREADSHEET_ID`, `GOOGLE_CREDENTIALS_JSON`. Read by `getSetting(key)` in `lib/db.ts`; environment variables always take precedence.

---

## API routes

### Stories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stories` | List all stories; `?topic=X` filters by topic |
| POST | `/api/stories` | Create story; auto-appends to Sheets if configured |
| GET | `/api/stories/random` | Return a random story |
| GET | `/api/stories/[id]` | Fetch one story |
| PATCH | `/api/stories/[id]` | Partial update (e.g. bookTitle, author) |
| DELETE | `/api/stories/[id]` | Delete story and its links |
| GET | `/api/stories/[id]/related` | Stories linked via shared topics |
| GET | `/api/stories/[id]/diagrams` | Return cached diagrams (generate if missing) |
| POST | `/api/stories/[id]/diagrams` | Clear cache and regenerate diagrams |

### Other

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/scan` | Upload image → Claude vision → create story |
| POST | `/api/analyze` | Compute Jaccard similarity across all story pairs |
| GET | `/api/graph` | Return graph nodes and edges for React Flow |
| GET | `/api/settings` | Return boolean status flags (never raw key values) |
| POST | `/api/settings` | Save one or more settings to the DB |
| POST | `/api/sync` | Bidirectional Google Sheets sync |

---

## Claude integration

All Claude calls live in `src/lib/claude.ts`. The client is created on each call via `getClient()`, which reads the API key from `process.env.ANTHROPIC_API_KEY` first, then falls back to the database setting.

### Diagram generation (two-step)

Generating multiple Mermaid diagrams in one Claude response is unreliable because Mermaid code contains literal newlines that break JSON encoding. The solution is two separate calls:

1. **Type selection** — `claude-haiku-4-5` receives the story and a menu of diagram types. Returns a tiny JSON array of `{type, label}` objects. No diagram code in this response, so JSON is safe.
2. **Code generation** — `claude-sonnet-4-6` generates raw Mermaid text for each selected type (plus always a mindmap). Runs in parallel with `Promise.allSettled`. Returns plain text, no JSON.

A mindmap is always included as the first diagram. Claude selects 2 additional types from:
`mindmap`, `flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `erDiagram`, `journey`, `timeline`, `pie`, `quadrantChart`

### Other Claude calls

| Function | Model | Purpose |
|----------|-------|---------|
| `extractStoryFromImage` | sonnet-4-6 | Vision: extract text + metadata from a photo |
| `extractTopics` | haiku-4-5 | Extract 3–7 topic strings from story content |
| `computeStorySimilarity` | — | Pure Jaccard overlap (no Claude call) |

---

## Theming

All colours are CSS custom properties defined in `globals.css`. The antiquarian palette uses warm parchment tones in light mode and deep sepia tones in dark mode.

```css
/* light */
--bg: #f5f0e8
--surface: #ffffff
--surface-2: #ede8de
--text: #1a1208
--accent: #c9940a   /* gold */
--border: #d4c9b0

/* dark */
--bg: #0d0a05
--surface: #1a1410
--surface-2: #26200f
--text: #f0e8d5
--accent: #e0aa20
--border: #3a3020
```

Dark mode is toggled by setting `data-theme="dark"` on `document.documentElement`. Components that render Mermaid diagrams use a `useIsDark()` hook backed by a `MutationObserver` on that attribute, so diagrams re-render when the theme changes.

---

## Diagram viewer

`DiagramViewer.tsx` is a fullscreen modal that renders Mermaid directly (not via `MermaidDiagram.tsx`) to get access to raw SVG geometry.

On mount:
1. Renders the Mermaid code into an SVG string.
2. Reads the SVG `viewBox` to get the natural dimensions.
3. Computes `fitScale = min(canvasW / svgW, canvasH / svgH, 1)` for best-fit.
4. Fades in after render.

**Zoom:** scroll wheel zooms toward the cursor position by computing the offset from canvas centre before and after scaling. Toolbar buttons zoom in 25% steps.

**Pan:** mouse drag and single-finger touch drag update a `{x, y}` translate offset.

**Pinch:** two-finger touch tracks the distance and midpoint between touch points. The raw ratio delta is damped by `PINCH_DAMPING = 0.6` to reduce sensitivity. The zoom origin is the pinch midpoint.

---

## Google Sheets sync

`src/lib/sheets.ts` provides three operations:

- `pushStoriesToSheets` — overwrites the `Stories` sheet with the full local library (creates the sheet if it doesn't exist)
- `pullStoriesFromSheets` — reads all rows and returns `Story` objects
- `appendStoryToSheets` — appends a single new story row (used on creation)

The bidirectional sync in `POST /api/sync`:
1. Pulls remote stories and upserts any new/changed ones locally.
2. Pushes the full updated local library back to Sheets.

Authentication resolves in order: `GOOGLE_CREDENTIALS_JSON` env → `GOOGLE_CREDENTIALS_JSON` in DB → `GOOGLE_CREDENTIALS_PATH` env (file path). The spreadsheet ID resolves: `SPREADSHEET_ID` env → DB setting.
