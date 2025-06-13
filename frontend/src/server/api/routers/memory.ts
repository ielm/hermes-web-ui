import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { memoryEntries, workspaceMembers, activityLogs } from "~/server/db/schema";
import { hermesClient } from "~/server/lib/hermes-client";

export const memoryRouter = createTRPCRouter({
  // Search memories
  search: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        namespace: z.string(),
        query: z.string(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      // Check access
      const hasAccess = await ctx.db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, input.workspaceId),
            eq(workspaceMembers.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (hasAccess.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      try {
        // Search via Hermes memory service
        const results = await hermesClient.searchMemory({
          namespace: `${input.workspaceId}:${input.namespace}`,
          query: input.query,
          limit: input.limit,
        });

        // Get local metadata for the results
        const hermesIds = results.results.map((r) => r.id);

        // Handle case where there are no results
        if (hermesIds.length === 0) {
          return {
            results: [],
            total: 0,
          };
        }

        const localEntries = await ctx.db
          .select()
          .from(memoryEntries)
          .where(
            and(
              eq(memoryEntries.workspaceId, input.workspaceId),
              sql`${memoryEntries.hermesMemoryId} = ANY(${sql.raw(
                `ARRAY[${hermesIds.map((id) => `'${id}'`).join(",")}]`
              )})`
            )
          );

        // Merge results with local data
        const merged = results.results.map((hermesResult) => {
          const local = localEntries.find((e) => e.hermesMemoryId === hermesResult.id);
          return {
            ...hermesResult,
            localId: local?.id,
            createdAt: local?.createdAt,
          };
        });

        return {
          results: merged,
          total: results.results.length,
        };
      } catch (_error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to search memories",
        });
      }
    }),

  // Store memory
  store: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        namespace: z.string(),
        content: z.string().min(1),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check access
      const hasAccess = await ctx.db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, input.workspaceId),
            eq(workspaceMembers.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (hasAccess.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      try {
        // Store in Hermes memory service
        const hermesResponse = await hermesClient.storeMemory({
          namespace: `${input.workspaceId}:${input.namespace}`,
          content: input.content,
          metadata: {
            ...input.metadata,
            userId: ctx.session.user.id,
            workspaceId: input.workspaceId,
          },
        });

        // Store reference locally
        const [entry] = await ctx.db
          .insert(memoryEntries)
          .values({
            workspaceId: input.workspaceId,
            userId: ctx.session.user.id,
            namespace: input.namespace,
            content: input.content,
            metadata: input.metadata,
            hermesMemoryId: hermesResponse.id,
          })
          .returning();

        if (!entry) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create memory entry",
          });
        }

        // Log activity
        await ctx.db.insert(activityLogs).values({
          userId: ctx.session.user.id,
          workspaceId: input.workspaceId,
          action: "memory.stored",
          resourceType: "memory",
          resourceId: entry.id,
          metadata: {
            namespace: input.namespace,
            contentLength: input.content.length,
          },
        });

        return entry;
      } catch (_error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to store memory",
        });
      }
    }),

  // Query memories with Omni language
  query: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        namespace: z.string(),
        omniQuery: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Check access
      const hasAccess = await ctx.db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, input.workspaceId),
            eq(workspaceMembers.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (hasAccess.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      try {
        // Query via Hermes memory service
        const results = await hermesClient.queryMemory({
          namespace: `${input.workspaceId}:${input.namespace}`,
          omniQuery: input.omniQuery,
        });

        return results;
      } catch (_error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to query memories",
        });
      }
    }),

  // List namespaces
  namespaces: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Check access
      const hasAccess = await ctx.db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, input.workspaceId),
            eq(workspaceMembers.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (hasAccess.length === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      const namespaces = await ctx.db
        .select({ namespace: memoryEntries.namespace })
        .from(memoryEntries)
        .where(eq(memoryEntries.workspaceId, input.workspaceId))
        .groupBy(memoryEntries.namespace);

      return namespaces.map((n) => n.namespace).filter(Boolean);
    }),

  // Delete memory entry
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [entry] = await ctx.db
        .select()
        .from(memoryEntries)
        .where(eq(memoryEntries.id, input.id))
        .limit(1);

      if (!entry) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Memory entry not found",
        });
      }

      // Check ownership
      if (entry.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Can only delete your own memories",
        });
      }

      // Delete from Hermes if exists
      if (entry.hermesMemoryId) {
        try {
          await hermesClient.deleteMemory(entry.hermesMemoryId);
        } catch (error) {
          console.error("Failed to delete from Hermes:", error);
        }
      }

      // Delete locally
      await ctx.db.delete(memoryEntries).where(eq(memoryEntries.id, input.id));

      // Log activity
      await ctx.db.insert(activityLogs).values({
        userId: ctx.session.user.id,
        workspaceId: entry.workspaceId,
        action: "memory.deleted",
        resourceType: "memory",
        resourceId: entry.id,
        metadata: {
          namespace: entry.namespace,
        },
      });

      return { success: true };
    }),
});