import type { Metadata } from "next";
import Nav from "./components/Nav";
import { aiConfigured, aiProvider } from "@/lib/ai";
import { getStore } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProofLine · No claim goes live without a source",
  description:
    "ProofLine checks marketing copy against approved brand guidelines and facts before publication, explains every issue, suggests fixes, and leaves approval to a human reviewer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = getStore().mode;
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Nav />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl space-y-1 px-4 py-4 text-xs text-slate-500">
            <p>
              Demo with fictional brand data (AquaPulse). ProofLine supports review and is not legal advice. A human reviewer always makes the final call.
            </p>
            <p>
              Data: {mode === "supabase" ? "stored in a Supabase database" : "in-memory demo store (resets when the server restarts)"} ·{" "}
              {aiConfigured() ? `AI claim check on (${aiProvider()}), with a rules-only fallback` : "Rules-only mode (no AI key set)"}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
