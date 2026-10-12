import { NextRequest, NextResponse } from "next/server";
import { authToken, COOKIE } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  if (!process.env.APP_PASSWORD) {
    return new NextResponse("APP_PASSWORD is not set. Add it in your Vercel project settings.", {
      status: 500,
    });
  }

  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && cookie === (await authToken())) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
