import Link from "next/link";
import { loginAs, logout } from "@/app/actions";
import { getCurrentUser } from "@/lib/session";
import { USERS } from "@/lib/seed";
import type { User } from "@/lib/types";

const ROLE_LABEL = { creator: "Creator", reviewer: "Reviewer", admin: "Admin" } as const;

export default async function Nav() {
  let user: User | null = null;
  try {
    user = await getCurrentUser();
  } catch {
    user = null;
  }
  const links = [
    { href: "/drafts", label: "Drafts" },
    { href: "/review", label: "Review queue" },
    { href: "/knowledge", label: "Guidelines & facts" },
    { href: "/audit", label: "Audit trail" },
    { href: "/about", label: "How it works" },
  ];
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight text-navy">
          Proof<span className="text-teal">Line</span>
        </Link>
        <nav aria-label="Main" className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {(user ? links : [links[4]]).map((l) => (
            <Link key={l.href} href={l.href} className="rounded px-1 py-1 text-slate-700 hover:text-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
              {l.label}
            </Link>
          ))}
        </nav>
        {user ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">
              {user.name} <span className="rounded bg-tint px-1.5 py-0.5 text-xs font-medium text-teal">{ROLE_LABEL[user.role]}</span>
            </span>
            <span className="text-slate-400" aria-hidden>
              |
            </span>
            <span className="text-xs text-slate-500">Switch to</span>
            {USERS.filter((u) => u.id !== user.id).map((u) => (
              <form key={u.id} action={loginAs}>
                <input type="hidden" name="user_id" value={u.id} />
                <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
                  {ROLE_LABEL[u.role]}
                </button>
              </form>
            ))}
            <form action={logout}>
              <button className="rounded px-2 py-1 text-xs text-slate-500 underline hover:text-slate-800">Leave demo</button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
