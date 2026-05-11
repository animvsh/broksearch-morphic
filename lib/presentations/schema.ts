import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core'

// Constants
const ID_LENGTH = 191
const VARCHAR_LENGTH = 256

// Enums
export const presentationStatusEnum = pgEnum('presentation_status', [
  'draft',
  'generating',
  'outline_generating',
  'slides_generating',
  'ready',
  'error'
])

export const outlineStatusEnum = pgEnum('outline_status', [
  'generating',
  'ready',
  'error'
])

export const generationStatusEnum = pgEnum('generation_status', [
  'started',
  'completed',
  'failed'
])

export const exportStatusEnum = pgEnum('export_status', [
  'pending',
  'processing',
  'completed',
  'failed'
])

// Tables

// presentations — core deck table
export const presentations = pgTable(
  'presentations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    workspaceId: uuid('workspace_id'),
    title: text('title').notNull(),
    description: text('description'),
    status: presentationStatusEnum('status').notNull().default('draft'),
    themeId: text('theme_id'),
    language: text('language').notNull().default('en'),
    style: text('style'), // startup/professional/casual/academic
    slideCount: integer('slide_count').notNull().default(0),
    shareId: text('share_id').unique(),
    isPublic: boolean('is_public').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  table => [
    index('presentations_user_id_idx').on(table.userId),
    index('presentations_user_id_created_at_idx').on(
      table.userId,
      table.createdAt.desc()
    ),
    index('presentations_workspace_id_idx').on(table.workspaceId),
    index('presentations_share_id_idx').on(table.shareId)
  ]
)

export type Presentation = typeof presentations.$inferSelect

// presentation_slides — individual slides
export const presentationSlides = pgTable(
  'presentation_slides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presentationId: uuid('presentation_id')
      .notNull()
      .references(() => presentations.id, { onDelete: 'cascade' }),
    slideIndex: integer('slide_index').notNull(),
    title: text('title').notNull(),
    layoutType: text('layout_type').notNull(), // title/section/two_column/image_left/chart/quote/text
    contentJson: jsonb('content_json').$type<Record<string, any>>().notNull(),
    speakerNotes: text('speaker_notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  table => [
    index('presentation_slides_presentation_id_idx').on(table.presentationId),
    uniqueIndex('presentation_slides_presentation_id_index_idx').on(
      table.presentationId,
      table.slideIndex
    )
  ]
)

export type PresentationSlide = typeof presentationSlides.$inferSelect

// presentation_outlines — outline data
export const presentationOutlines = pgTable(
  'presentation_outlines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presentationId: uuid('presentation_id')
      .notNull()
      .references(() => presentations.id, { onDelete: 'cascade' })
      .unique(),
    outlineJson: jsonb('outline_json')
      .$type<Array<{ title: string; bullets: string[] }>>()
      .notNull(),
    status: outlineStatusEnum('status').notNull().default('generating'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  table => [
    index('presentation_outlines_presentation_id_idx').on(table.presentationId)
  ]
)

export type PresentationOutline = typeof presentationOutlines.$inferSelect

// presentation_themes — themes
export const presentationThemes = pgTable(
  'presentation_themes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'), // null = builtin
    name: text('name').notNull(),
    themeJson: jsonb('theme_json').$type<Record<string, any>>().notNull(),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  table => [
    index('presentation_themes_user_id_idx').on(table.userId),
    index('presentation_themes_is_builtin_idx').on(table.isBuiltin)
  ]
)

export type PresentationTheme = typeof presentationThemes.$inferSelect

// presentation_assets — generated images/media
export const presentationAssets = pgTable(
  'presentation_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presentationId: uuid('presentation_id')
      .notNull()
      .references(() => presentations.id, { onDelete: 'cascade' }),
    slideId: uuid('slide_id').references(() => presentationSlides.id, {
      onDelete: 'cascade'
    }),
    assetType: text('asset_type').notNull(), // image/chart/icon
    url: text('url'),
    provider: text('provider').notNull(), // Brok/stock/none
    prompt: text('prompt'),
    metadataJson: jsonb('metadata_json').$type<Record<string, any>>(),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  table => [
    index('presentation_assets_presentation_id_idx').on(table.presentationId),
    index('presentation_assets_slide_id_idx').on(table.slideId)
  ]
)

export type PresentationAsset = typeof presentationAssets.$inferSelect

// presentation_generations — generation tracking
export const presentationGenerations = pgTable(
  'presentation_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presentationId: uuid('presentation_id')
      .notNull()
      .references(() => presentations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    prompt: text('prompt').notNull(),
    generationType: text('generation_type').notNull(), // outline/slides/edit
    model: text('model').notNull(),
    webSearchEnabled: boolean('web_search_enabled').notNull().default(false),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: integer('cost_usd').notNull().default(0), // stored as cents
    status: generationStatusEnum('status').notNull().default('started'),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  table => [
    index('presentation_generations_presentation_id_idx').on(
      table.presentationId
    ),
    index('presentation_generations_user_id_idx').on(table.userId),
    index('presentation_generations_created_at_idx').on(table.createdAt)
  ]
)

export type PresentationGeneration = typeof presentationGenerations.$inferSelect

// presentation_exports — export tracking
export const presentationExports = pgTable(
  'presentation_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    presentationId: uuid('presentation_id')
      .notNull()
      .references(() => presentations.id, { onDelete: 'cascade' }),
    exportType: text('export_type').notNull(), // pptx/pdf/images
    fileUrl: text('file_url'),
    status: exportStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  table => [
    index('presentation_exports_presentation_id_idx').on(table.presentationId),
    index('presentation_exports_status_idx').on(table.status)
  ]
)

export type PresentationExport = typeof presentationExports.$inferSelect

// Relations

export const presentationsRelations = relations(
  presentations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [presentations.userId],
      references: [users.id]
    }),
    workspace: one(workspaces, {
      fields: [presentations.workspaceId],
      references: [workspaces.id]
    }),
    slides: many(presentationSlides),
    outline: one(presentationOutlines),
    assets: many(presentationAssets),
    generations: many(presentationGenerations),
    exports: many(presentationExports)
  })
)

export const presentationSlidesRelations = relations(
  presentationSlides,
  ({ one, many }) => ({
    presentation: one(presentations, {
      fields: [presentationSlides.presentationId],
      references: [presentations.id]
    }),
    assets: many(presentationAssets)
  })
)

export const presentationOutlinesRelations = relations(
  presentationOutlines,
  ({ one }) => ({
    presentation: one(presentations, {
      fields: [presentationOutlines.presentationId],
      references: [presentations.id]
    })
  })
)

export const presentationThemesRelations = relations(
  presentationThemes,
  ({ one }) => ({
    user: one(users, {
      fields: [presentationThemes.userId],
      references: [users.id]
    })
  })
)

export const presentationAssetsRelations = relations(
  presentationAssets,
  ({ one }) => ({
    presentation: one(presentations, {
      fields: [presentationAssets.presentationId],
      references: [presentations.id]
    }),
    slide: one(presentationSlides, {
      fields: [presentationAssets.slideId],
      references: [presentationSlides.id]
    })
  })
)

export const presentationGenerationsRelations = relations(
  presentationGenerations,
  ({ one }) => ({
    presentation: one(presentations, {
      fields: [presentationGenerations.presentationId],
      references: [presentations.id]
    }),
    user: one(users, {
      fields: [presentationGenerations.userId],
      references: [users.id]
    })
  })
)

export const presentationExportsRelations = relations(
  presentationExports,
  ({ one }) => ({
    presentation: one(presentations, {
      fields: [presentationExports.presentationId],
      references: [presentations.id]
    })
  })
)

// Placeholder references to existing tables (defined in lib/db/schema.ts)
// These allow Drizzle to understand the foreign key relationships

const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom()
})

const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom()
})
