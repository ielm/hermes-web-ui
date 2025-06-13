import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  timestamp,
  jsonb,
  index,
  uuid,
  integer,
  text,
  pgEnum,
} from "drizzle-orm/pg-core";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "user", "viewer"]);
export const executionStatusEnum = pgEnum("execution_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const workspaceVisibilityEnum = pgEnum("workspace_visibility", [
  "private",
  "team",
  "public",
]);

// Users table - synced with WorkOS
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    avatarUrl: text("avatar_url"),
    workosUserId: varchar("workos_user_id", { length: 255 }).unique(),
    workosOrgId: varchar("workos_org_id", { length: 255 }),
    role: userRoleEnum("role").default("user").notNull(),
    metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
    workosUserIdx: index("users_workos_user_idx").on(table.workosUserId),
  })
);

// Sessions table - for session management
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    token: varchar("token", { length: 512 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenIdx: index("sessions_token_idx").on(table.token),
    userIdx: index("sessions_user_idx").on(table.userId),
    expiresIdx: index("sessions_expires_idx").on(table.expiresAt),
  })
);

// Workspaces table - for organizing work
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    description: text("description"),
    ownerId: uuid("owner_id")
      .references(() => users.id)
      .notNull(),
    visibility: workspaceVisibilityEnum("visibility").default("private").notNull(),
    settings: jsonb("settings").default({}).$type<{
      defaultLanguage?: string;
      defaultEnvironment?: Record<string, string>;
      features?: string[];
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index("workspaces_slug_idx").on(table.slug),
    ownerIdx: index("workspaces_owner_idx").on(table.ownerId),
  })
);

// Workspace members - for collaboration
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: userRoleEnum("role").default("viewer").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceUserIdx: index("workspace_members_workspace_user_idx").on(
      table.workspaceId,
      table.userId
    ),
  })
);

// Executions table - tracking code executions
export const executions = pgTable(
  "executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    title: varchar("title", { length: 255 }),
    language: varchar("language", { length: 50 }).notNull(),
    code: text("code").notNull(),
    environment: jsonb("environment").default({}).$type<Record<string, string>>(),
    status: executionStatusEnum("status").default("pending").notNull(),
    output: text("output"),
    error: text("error"),
    executionTimeMs: integer("execution_time_ms"),
    memoryUsageMb: integer("memory_usage_mb"),
    hermesExecutionId: varchar("hermes_execution_id", { length: 255 }),
    metadata: jsonb("metadata").default({}).$type<{
      version?: string;
      tags?: string[];
      metrics?: Record<string, number>;
    }>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index("executions_workspace_idx").on(table.workspaceId),
    userIdx: index("executions_user_idx").on(table.userId),
    statusIdx: index("executions_status_idx").on(table.status),
    hermesIdx: index("executions_hermes_idx").on(table.hermesExecutionId),
  })
);

// Memory entries - for vector/knowledge storage
export const memoryEntries = pgTable(
  "memory_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id)
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    namespace: varchar("namespace", { length: 255 }).notNull(),
    content: text("content").notNull(),
    embedding: sql<number[]>`vector(1536)`, // For pgvector
    metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
    hermesMemoryId: varchar("hermes_memory_id", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceNamespaceIdx: index("memory_entries_workspace_namespace_idx").on(
      table.workspaceId,
      table.namespace
    ),
    hermesIdx: index("memory_entries_hermes_idx").on(table.hermesMemoryId),
  })
);

// Activity logs - for audit trail
export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    action: varchar("action", { length: 100 }).notNull(),
    resourceType: varchar("resource_type", { length: 50 }),
    resourceId: uuid("resource_id"),
    metadata: jsonb("metadata").default({}).$type<Record<string, unknown>>(),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("activity_logs_user_idx").on(table.userId),
    workspaceIdx: index("activity_logs_workspace_idx").on(table.workspaceId),
    actionIdx: index("activity_logs_action_idx").on(table.action),
    createdIdx: index("activity_logs_created_idx").on(table.createdAt),
  })
);

// API keys - for programmatic access
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    keyHash: varchar("key_hash", { length: 255 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 10 }).notNull(),
    scopes: jsonb("scopes").default([]).$type<string[]>(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("api_keys_user_idx").on(table.userId),
    workspaceIdx: index("api_keys_workspace_idx").on(table.workspaceId),
    prefixIdx: index("api_keys_prefix_idx").on(table.keyPrefix),
  })
);

// Type exports for use in application
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
export type MemoryEntry = typeof memoryEntries.$inferSelect;
export type NewMemoryEntry = typeof memoryEntries.$inferInsert;
