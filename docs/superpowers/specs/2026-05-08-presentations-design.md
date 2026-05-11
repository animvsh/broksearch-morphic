# Brok Presentations — Integration Design

## Source of Truth

The full product specification lives in: **ePRD: Integrate AI Presentation Builder into Brok** (provided by user, 2026-05-08).

This doc covers **implementation-specific decisions** and **tech stack alignment** with the existing Brok/Morphic codebase.

## Tech Stack Alignment

| Concern     | Decision                                   |
| ----------- | ------------------------------------------ |
| Framework   | Next.js 16 (App Router) — same as Morphic  |
| Language    | TypeScript — same as Morphic               |
| Styling     | Tailwind CSS + CSS variables for themes    |
| Database    | Drizzle ORM + PostgreSQL — same as Morphic |
| AI Provider | Brok generation gateway via AI SDK         |
| State       | Zustand — same as Morphic                  |
| Export      | pptxgenjs for PPTX export                  |
| Auth        | Supabase — same as Morphic                 |

## Project Structure

```
app/
├── presentations/
│   ├── page.tsx                    # Dashboard
│   ├── new/page.tsx                # New presentation
│   ├── [id]/
│   │   ├── editor/page.tsx         # Slide editor
│   │   └── present/page.tsx        # Presentation mode
├── api/
│   └── presentations/
│       ├── route.ts                # POST create
│       └── [id]/
│           ├── route.ts            # GET/PATCH single
│           ├── generate-outline/route.ts
│           ├── outline/route.ts    # PATCH update outline
│           ├── generate-slides/route.ts
│           ├── stream/route.ts     # SSE generation stream
│           ├── edit/route.ts       # POST chat edit
│           ├── export/route.ts
│           └── share/route.ts
components/
├── presentations/
│   ├── dashboard/
│   │   ├── presentations-dashboard.tsx
│   │   ├── presentation-card.tsx
│   │   └── new-presentation-button.tsx
│   ├── creator/
│   │   ├── new-presentation-page.tsx
│   │   ├── prompt-box.tsx
│   │   └── settings-panel.tsx
│   ├── outline/
│   │   ├── outline-editor.tsx
│   │   └── outline-slide-row.tsx
│   ├── editor/
│   │   ├── slide-editor.tsx
│   │   ├── slide-canvas.tsx
│   │   ├── slide-thumbnail-list.tsx
│   │   ├── slide-inspector.tsx
│   │   └── ai-edit-bar.tsx
│   ├── theme/
│   │   ├── theme-picker.tsx
│   │   └── themes.ts               # 8 built-in themes
│   ├── present/
│   │   └── presentation-mode.tsx
│   ├── share/
│   │   └── share-modal.tsx
│   └── export/
│       └── export-modal.tsx
lib/
├── presentations/
│   ├── schema.ts                  # Drizzle schema
│   ├── ai/
│   │   ├── outline-agent.ts        # Outline generation
│   │   ├── slide-agent.ts         # Slide generation
│   │   └── edit-agent.ts          # Chat-based editing
│   ├── export/
│   │   └── pptx.ts                # PPTX generation
│   └── themes.ts                  # Theme definitions
states/
└── presentation-store.ts          # Zustand store

## Implementation Phases

### Phase 1: Foundation (parallel)
- **Schema** (Task 9): Drizzle schema for all tables
- **Theme System** (Task 7): 8 built-in themes + picker

### Phase 2: Backend + Shell Frontend (parallel)
- **API Routes** (Task 3): All REST endpoints
- **Dashboard** (Task 10): `/presentations` page
- **New Presentation** (Task 4): `/presentations/new` page

### Phase 3: Editor & Presentation (parallel)
- **Outline Editor** (Task 11): Editable outline UI
- **Slide Editor** (Task 8): 3-panel editor layout
- **Presentation Mode** (Task 1): Fullscreen presenter

### Phase 4: Output & Admin (parallel)
- **PPTX Export** (Task 12): PowerPoint generation
- **Share** (Task 2): Link sharing
- **Admin Panel** (Task 5): Admin dashboard section

### Phase 5: Integration & Testing
- **E2E Testing** (Task 6): Full flow verification

## API Design

All endpoints under `/api/presentations/`:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/presentations` | Create new presentation |
| GET | `/api/presentations/:id` | Get presentation |
| PATCH | `/api/presentations/:id` | Update presentation |
| DELETE | `/api/presentations/:id` | Delete presentation |
| POST | `/api/presentations/:id/generate-outline` | Start outline generation |
| PATCH | `/api/presentations/:id/outline` | Update outline |
| POST | `/api/presentations/:id/generate-slides` | Start slide generation |
| GET | `/api/presentations/:id/stream` | SSE stream for generation events |
| POST | `/api/presentations/:id/edit` | Chat-based edit |
| POST | `/api/presentations/:id/export` | Export to PPTX |
| POST | `/api/presentations/:id/share` | Create share link |

## Key Dependencies

- Brok generation gateway credentials configured in the server environment
- pptxgenjs package for PPTX export
- Drizzle for ORM (already in project)
- Zustand for state (already in project)
- Tailwind for styling (already in project)
```
