import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { executions, workspaceMembers, activityLogs } from "~/server/db/schema";
import { hermesClient } from "~/server/lib/hermes-client";

export const executionRouter = createTRPCRouter({
  // List executions in a workspace
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        status: z
          .enum(["pending", "running", "completed", "failed", "cancelled"])
          .optional(),
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

      const where = input.status
        ? and(
            eq(executions.workspaceId, input.workspaceId),
            eq(executions.status, input.status)
          )
        : eq(executions.workspaceId, input.workspaceId);

      const results = await ctx.db
        .select()
        .from(executions)
        .where(where)
        .orderBy(desc(executions.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [{ count }] = await ctx.db
        .select({ count: sql`count(*)::int` })
        .from(executions)
        .where(where);

      return {
        items: results,
        total: count ?? 0,
        hasMore: input.offset + results.length < (count ?? 0),
      };
    }),

  // Get single execution
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [execution] = await ctx.db
        .select()
        .from(executions)
        .where(eq(executions.id, input.id))
        .limit(1);

      if (!execution) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Execution not found",
        });
      }

      // Check access
      const hasAccess = await ctx.db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, execution.workspaceId),
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

      return execution;
    }),

  // Create new execution
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        title: z.string().optional(),
        language: z.enum(["python", "javascript", "typescript", "go", "rust"]),
        code: z.string().min(1),
        environment: z.record(z.string()).optional(),
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

      // Create execution record
      const [execution] = await ctx.db
        .insert(executions)
        .values({
          ...input,
          userId: ctx.session.user.id,
          status: "pending",
        })
        .returning();

      if (!execution) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create execution",
        });
      }

      // Submit to Hermes platform
      try {
        const hermesResponse = await hermesClient.createExecution({
          code: input.code,
          language: input.language,
          environment: input.environment ?? {},
        });

        // Update with Hermes execution ID
        await ctx.db
          .update(executions)
          .set({
            hermesExecutionId: hermesResponse.executionId,
            status: "running",
            startedAt: new Date(),
          })
          .where(eq(executions.id, execution.id));

        // Log activity
        await ctx.db.insert(activityLogs).values({
          userId: ctx.session.user.id,
          workspaceId: input.workspaceId,
          action: "execution.created",
          resourceType: "execution",
          resourceId: execution.id,
          metadata: {
            language: input.language,
            title: input.title,
          },
        });

        return {
          ...execution,
          hermesExecutionId: hermesResponse.executionId,
          status: "running" as const,
        };
      } catch (error) {
        // Update status to failed
        await ctx.db
          .update(executions)
          .set({
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
            completedAt: new Date(),
          })
          .where(eq(executions.id, execution.id));

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to submit execution",
        });
      }
    }),

  // Cancel execution
  cancel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [execution] = await ctx.db
        .select()
        .from(executions)
        .where(eq(executions.id, input.id))
        .limit(1);

      if (!execution) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Execution not found",
        });
      }

      // Check ownership
      if (execution.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Can only cancel your own executions",
        });
      }

      if (execution.status !== "running" && execution.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Execution is not running",
        });
      }

      // Cancel in Hermes
      if (execution.hermesExecutionId) {
        try {
          await hermesClient.cancelExecution(execution.hermesExecutionId);
        } catch (error) {
          console.error("Failed to cancel in Hermes:", error);
        }
      }

      // Update status
      const [updated] = await ctx.db
        .update(executions)
        .set({
          status: "cancelled",
          completedAt: new Date(),
        })
        .where(eq(executions.id, input.id))
        .returning();

      // Log activity
      await ctx.db.insert(activityLogs).values({
        userId: ctx.session.user.id,
        workspaceId: execution.workspaceId,
        action: "execution.cancelled",
        resourceType: "execution",
        resourceId: execution.id,
      });

      return updated;
    }),

  // Get execution logs (for real-time updates)
  logs: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [execution] = await ctx.db
        .select()
        .from(executions)
        .where(eq(executions.id, input.id))
        .limit(1);

      if (!execution) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Execution not found",
        });
      }

      // Check access
      const hasAccess = await ctx.db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, execution.workspaceId),
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

      // In production, this would fetch logs from Redis/streaming service
      return {
        executionId: execution.id,
        logs: [
          {
            timestamp: new Date().toISOString(),
            level: "info" as const,
            message: "Execution started",
          },
        ],
      };
    }),
});