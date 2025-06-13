import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  workspaces,
  workspaceMembers,
  executions,
  memoryEntries,
  activityLogs,
} from "~/server/db/schema";

export const workspaceRouter = createTRPCRouter({
  // List user's workspaces
  list: protectedProcedure.query(async ({ ctx }) => {
    const userWorkspaces = await ctx.db
      .select({
        workspace: workspaces,
        role: workspaceMembers.role,
      })
      .from(workspaces)
      .leftJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, workspaces.id),
          eq(workspaceMembers.userId, ctx.session.user.id)
        )
      )
      .where(eq(workspaceMembers.userId, ctx.session.user.id))
      .orderBy(desc(workspaces.createdAt));

    return userWorkspaces.map(({ workspace, role }) => ({
      ...workspace,
      role: role ?? "owner",
    }));
  }),

  // Get workspace by slug
  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [workspace] = await ctx.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.slug, input.slug))
        .limit(1);

      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found",
        });
      }

      // Check access
      const [member] = await ctx.db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspace.id),
            eq(workspaceMembers.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      const isOwner = workspace.ownerId === ctx.session.user.id;

      if (!isOwner && !member && workspace.visibility === "private") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      return {
        ...workspace,
        role: isOwner ? "owner" : (member?.role ?? "viewer"),
      };
    }),

  // Create workspace
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(255),
        slug: z
          .string()
          .min(2)
          .max(255)
          .regex(/^[a-z0-9-]+$/),
        description: z.string().optional(),
        visibility: z.enum(["private", "team", "public"]).default("private"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if slug exists
      const existing = await ctx.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.slug, input.slug))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Workspace slug already exists",
        });
      }

      const [workspace] = await ctx.db
        .insert(workspaces)
        .values({
          ...input,
          ownerId: ctx.session.user.id,
        })
        .returning();

      if (!workspace) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create workspace",
        });
      }

      // Log activity
      await ctx.db.insert(activityLogs).values({
        userId: ctx.session.user.id,
        workspaceId: workspace.id,
        action: "workspace.created",
        resourceType: "workspace",
        resourceId: workspace.id,
        metadata: { name: workspace.name },
      });

      return workspace;
    }),

  // Update workspace
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(255).optional(),
        description: z.string().optional(),
        visibility: z.enum(["private", "team", "public"]).optional(),
        settings: z
          .object({
            defaultLanguage: z.string().optional(),
            defaultEnvironment: z.record(z.string()).optional(),
            features: z.array(z.string()).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      // Check ownership
      const [workspace] = await ctx.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, id))
        .limit(1);

      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found",
        });
      }

      if (workspace.ownerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners can update workspaces",
        });
      }

      const [updated] = await ctx.db
        .update(workspaces)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, id))
        .returning();

      // Log activity
      await ctx.db.insert(activityLogs).values({
        userId: ctx.session.user.id,
        workspaceId: id,
        action: "workspace.updated",
        resourceType: "workspace",
        resourceId: id,
        metadata: updates,
      });

      return updated;
    }),

  // Delete workspace
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check ownership
      const [workspace] = await ctx.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, input.id))
        .limit(1);

      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found",
        });
      }

      if (workspace.ownerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners can delete workspaces",
        });
      }

      await ctx.db.delete(workspaces).where(eq(workspaces.id, input.id));

      // Log activity
      await ctx.db.insert(activityLogs).values({
        userId: ctx.session.user.id,
        action: "workspace.deleted",
        resourceType: "workspace",
        resourceId: input.id,
        metadata: { name: workspace.name },
      });

      return { success: true };
    }),

  // Get workspace statistics
  stats: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify access
      const [member] = await ctx.db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, input.workspaceId),
            eq(workspaceMembers.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      // Get stats
      const [executionCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(executions)
        .where(eq(executions.workspaceId, input.workspaceId));

      const [memoryCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(memoryEntries)
        .where(eq(memoryEntries.workspaceId, input.workspaceId));

      const [memberCount] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, input.workspaceId));

      return {
        executions: executionCount?.count ?? 0,
        memories: memoryCount?.count ?? 0,
        members: memberCount?.count ?? 0,
      };
    }),
});
