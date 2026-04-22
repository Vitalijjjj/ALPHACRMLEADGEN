import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export const proxy = auth(function (request) {
  const { pathname } = request.nextUrl;
  const isLoggedIn = !!request.auth;

  if (pathname === "/login") {
    if (isLoggedIn) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
