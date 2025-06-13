import Link from "next/link";
import { HydrateClient } from "~/trpc/server";

export default function Home() {
  return (
    <HydrateClient>
      <main className="from-background to-muted flex min-h-screen flex-col items-center justify-center bg-gradient-to-b">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            Hermes <span className="text-primary">Platform</span>
          </h1>
          <p className="text-muted-foreground text-center text-lg">
            Universal secure compute platform for AI agents and code execution
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8">
            <Link
              className="bg-card hover:bg-accent flex max-w-xs flex-col gap-4 rounded-xl border p-4 transition-colors"
              href="/auth/signin"
            >
              <h3 className="text-2xl font-bold">Sign In →</h3>
              <div className="text-lg">
                Access your workspaces and start executing code in secure sandboxes.
              </div>
            </Link>
            <Link
              className="bg-card hover:bg-accent flex max-w-xs flex-col gap-4 rounded-xl border p-4 transition-colors"
              href="/docs"
            >
              <h3 className="text-2xl font-bold">Documentation →</h3>
              <div className="text-lg">
                Learn about the Hermes platform, APIs, and integration guides.
              </div>
            </Link>
          </div>
        </div>
      </main>
    </HydrateClient>
  );
}
