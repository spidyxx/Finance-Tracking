import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type SessionData } from "@/lib/session";

/** Session helper for route handlers / server components. */
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
