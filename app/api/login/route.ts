import { NextResponse } from "next/server";
import { authToken, COOKIE } from "@/lib/auth";
import { redis } from "@/lib/redis";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    const key = `rl:login:${ip}`;
    const attempts = await redis().incr(key);
    if (attempts === 1) await redis().expire(key, 900);
    if (attempts > 10) {
      return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    }
  } catch {
    // Rate limiting is best-effort; don't block login if Redis is unreachable.
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await authToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
