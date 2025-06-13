import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "~/server/api/trpc";
import { users, sessions } from "~/server/db/schema";
import { generateToken } from "~/server/lib/auth";

export const authRouter = createTRPCRouter({
  // Get current user
  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.session.user;
  }),

  // Sign up with email/password (for demo - production would use WorkOS)
  signUp: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().min(2),
        password: z.string().min(8),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user exists
      const existingUser = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existingUser.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User already exists",
        });
      }

      // Create user (in production, this would sync with WorkOS)
      const [newUser] = await ctx.db
        .insert(users)
        .values({
          email: input.email,
          name: input.name,
        })
        .returning();

      if (!newUser) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user",
        });
      }

      // Create session
      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await ctx.db.insert(sessions).values({
        userId: newUser.id,
        token,
        expiresAt,
        ipAddress: ctx.headers?.["x-forwarded-for"] as string,
        userAgent: ctx.headers?.["user-agent"] as string,
      });

      return {
        user: newUser,
        token,
      };
    }),

  // Sign in with email/password (for demo - production would use WorkOS)
  signIn: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select().from(users).where(eq(users.email, input.email)).limit(1);

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      // Create session
      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await ctx.db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt,
        ipAddress: ctx.headers?.["x-forwarded-for"] as string,
        userAgent: ctx.headers?.["user-agent"] as string,
      });

      // Update last active
      await ctx.db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));

      return {
        user,
        token,
      };
    }),

  // Sign out
  signOut: protectedProcedure.mutation(async ({ ctx }) => {
    // Delete the current session
    await ctx.db.delete(sessions).where(eq(sessions.token, ctx.session.token));

    return { success: true };
  }),

  // Sign in with WorkOS (SSO)
  signInWithWorkOS: publicProcedure
    .input(
      z.object({
        code: z.string(),
        state: z.string().optional(),
      })
    )
    .mutation(async ({ ctx: _ctx, input: _input }) => {
      // TODO: Implement WorkOS OAuth flow
      // This would exchange the code for user info via WorkOS API
      throw new TRPCError({
        code: "NOT_IMPLEMENTED",
        message: "WorkOS integration coming soon",
      });
    }),

  // Refresh session
  refreshSession: protectedProcedure.mutation(async ({ ctx }) => {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await ctx.db.update(sessions).set({ expiresAt }).where(eq(sessions.id, ctx.session.id));

    return { expiresAt };
  }),
});
