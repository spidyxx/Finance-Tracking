import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSession } from "@/lib/session-server";

const schema = z.object({ password: z.string().min(1) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  const encoded = process.env.APP_PASSWORD_HASH;
  if (!encoded) {
    return NextResponse.json(
      {
        error:
          "No password is configured. Set APP_PASSWORD_HASH (npm run hash-password).",
      },
      { status: 500 },
    );
  }

  // The hash is stored base64-encoded so its `$` characters survive Next's
  // dotenv-expand env loading. Decode back to the raw bcrypt hash here.
  const hash = Buffer.from(encoded, "base64").toString("utf8");
  if (!hash.startsWith("$2")) {
    return NextResponse.json(
      {
        error:
          "APP_PASSWORD_HASH is invalid. Regenerate it with: npm run hash-password.",
      },
      { status: 500 },
    );
  }

  const ok = await bcrypt.compare(parsed.data.password, hash);
  if (!ok) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const session = await getSession();
  session.loggedIn = true;
  await session.save();
  return NextResponse.json({ ok: true });
}
