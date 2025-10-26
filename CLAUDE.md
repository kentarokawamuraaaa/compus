# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js application for parsing and searching Japanese company data, built with:
- **Next.js 15** (App Router with React Server Components)
- **Convex** for real-time database and backend functions
- **OpenAI API** for intelligent parsing of Japanese tabular company data
- **shadcn/ui** components with Tailwind CSS v4
- **TypeScript** in strict mode

The app allows users to paste Japanese company financial data (PER, PBR, ROE, market cap, etc.), parse it via LLM or heuristics, search a database of ~1.6MB of company listings ([app/tosyo.json](app/tosyo.json)), and manage selected companies.

## Development Commands

```bash
# Start Next.js dev server (port 3000)
npm run dev

# Start Convex backend in dev mode (run in separate terminal)
npx convex dev

# Build for production
npm run build

# Start production server
npm start

# Lint the codebase
npm run lint

# Deploy Convex functions
npx convex deploy
```

**Important**: You need **both** `npm run dev` AND `npx convex dev` running simultaneously for full functionality.

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_CONVEX_URL` - Convex deployment URL (set by `npx convex dev`)
- `OPENAI_API_KEY` - Optional, for LLM-based parsing in [app/api/parse/route.ts](app/api/parse/route.ts)

## Architecture

### Data Flow

1. **Company Search**: User types → debounced search → `/api/companies/search` → searches [app/tosyo.json](app/tosyo.json) in-memory
2. **Company Selection**: Selected companies stored in React state (`selectedList`)
3. **Data Parsing**: User pastes tabular text → `/api/parse` → OpenAI (gpt-5-mini) or heuristic parser → structured JSON
4. **Data Storage**: Parsed data stored per-company in client state (`stateByCode`)

### Backend Architecture (Convex)

Convex schema in [convex/schema.ts](convex/schema.ts):
- `companies` table: `code`, `name`, `nameLower`, `uploadedAt`, `extra` (optional record)
- Indexes: `by_code`, `by_nameLower` for efficient queries

Convex functions in [convex/companies.ts](convex/companies.ts):
- `replaceAll`: mutation that deletes all companies and inserts new batch
- `upsertMany`: mutation that updates existing or inserts new companies
- `search`: query with prefix search on `nameLower` using range scan
- `getByCode`: query to fetch single company by normalized code
- Helper: `normalizeCode()` strips non-alphanumeric and uppercases

### Frontend Architecture

- **App Router**: All routes in `app/` directory
- **Client Provider**: [app/ConvexClientProvider.tsx](app/ConvexClientProvider.tsx) wraps app with Convex client
- **Main UI**: [app/page.tsx](app/page.tsx) - single-page app with company search, selection, data parsing, and summary display
- **API Routes**:
  - [app/api/parse/route.ts](app/api/parse/route.ts): POST endpoint for parsing Japanese tabular text
  - [app/api/companies/search/route.ts](app/api/companies/search/route.ts): GET endpoint for searching tosyo.json

### UI Components (shadcn/ui)

Located in [components/ui/](components/ui/):
- Uses "new-york" style variant
- Components: `button`, `card`, `input`, `scroll-area`, `skeleton`
- Configuration: [components.json](components.json)
- Path aliases: `@/components`, `@/lib/utils`

### Data Parsing Logic

[app/api/parse/route.ts](app/api/parse/route.ts) implements two-tier parsing:

1. **LLM-based** (primary): OpenAI gpt-5-mini extracts headers and rows from Japanese text, preserving:
   - Stock codes (4-digit identifiers)
   - Company names
   - Financial columns with units (兆円, 億円, 倍, %)
   - Handles multi-token headers like "PER (会)"

2. **Heuristic fallback**: Regex-based tokenization when LLM fails or API key missing
   - `tokenizeHeader()`: Splits headers, joins parenthetical suffixes, excludes identifier columns
   - `tokenizeRow()`: Normalizes number-unit spacing, tokenizes on whitespace
   - `mergeNumberUnits()`: Fixes "4,855 億円" → "4,855億円"
   - `isNumericLikeToken()`: Detects financial values vs text (for name extraction)

Validation: `isValidParsed()` ensures headers include key financial terms (PER, 時価, 企業価値, ROE, 売上)

## Key Technical Details

- **Tailwind CSS v4**: Uses new PostCSS plugin (`@tailwindcss/postcss`)
- **Path aliases**: `@/*` maps to project root (configured in [tsconfig.json](tsconfig.json))
- **TypeScript strict mode**: All code must satisfy strict type checking
- **Company data file**: [app/tosyo.json](app/tosyo.json) is a large (1.6MB) static dataset loaded at runtime
- **Debounced search**: 200ms debounce on search input using `lodash.debounce`

## Common Patterns

### Adding a Convex Function

1. Define in `convex/*.ts` with proper validators using `v` from `convex/values`
2. Export as `query`, `mutation`, or `action`
3. Use `ctx.db` for database operations
4. Run `npx convex dev` to auto-generate types in `convex/_generated/`

### Adding a shadcn/ui Component

```bash
npx shadcn@latest add <component-name>
```

This will add to [components/ui/](components/ui/) using project configuration from [components.json](components.json).

### Using Convex in React Components

```tsx
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

// In component:
const companies = useQuery(api.companies.search, { q: "toyota", limit: 20 });
const upsert = useMutation(api.companies.upsertMany);
```

## Japanese Text Processing

The app handles Japanese company data with specific requirements:
- Preserve number formatting with commas (e.g., "100,257")
- Keep units attached (e.g., "億円", "倍", "%")
- Normalize half-width/full-width characters (NFKC normalization)
- Handle multi-token company names (spaces in names)
- Case-insensitive search using `.toLowerCase()` on normalized text
