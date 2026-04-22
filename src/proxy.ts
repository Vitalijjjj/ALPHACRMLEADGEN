export { auth as proxy } from "@/lib/auth";

export const config = {
  // Exclude all /api/ routes — they handle their own auth
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
