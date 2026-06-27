import type { SessionOptions } from "iron-session";

export type SessionData = {
  loggedIn: boolean;
};

// No next/headers / bcrypt imports here so this module is safe to import from
// edge middleware. See lib/session-server.ts for the route-handler helper.
export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_SECRET ||
    "dev-only-secret-change-me-at-least-32-characters",
  cookieName: "finance_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    // LAN-only over HTTP; also works fine behind an optional HTTPS proxy.
    secure: false,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};
