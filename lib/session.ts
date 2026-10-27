import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { USERS } from "./seed";
import type { Role, User } from "./types";

export const USER_COOKIE = "pl_user";
export const SESSION_COOKIE = "pl_sess";

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const id = jar.get(USER_COOKIE)?.value;
  return USERS.find((u) => u.id === id) ?? null;
}

export async function getSessionId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** Page guard: signed-in demo user with a session, optionally restricted to roles. */
export async function requireUser(roles?: Role[]): Promise<{ user: User; sessionId: string }> {
  const user = await getCurrentUser();
  const sessionId = await getSessionId();
  if (!user || !sessionId) redirect("/");
  if (roles && !roles.includes(user.role)) redirect("/drafts");
  return { user, sessionId };
}

export const homeFor = (role: Role) =>
  role === "creator" ? "/drafts" : role === "reviewer" ? "/review" : "/knowledge";
