import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = [
  "/dashboard",
  "/materials",
  "/mixing",
  "/process",
  "/vouchers",
  "/stock",
  "/dispatch",
  "/rejections",
  "/reports",
  "/opening",
  "/products",
  "/masters",
  "/users",
];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("viaz_token");
  const { pathname } = request.nextUrl;

  if (PROTECTED.some((p) => pathname.startsWith(p)) && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (pathname === "/login" && token) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/users/:path*",
    "/materials/:path*",
    "/mixing/:path*",
    "/process/:path*",
    "/vouchers/:path*",
    "/stock/:path*",
    "/dispatch/:path*",
    "/rejections/:path*",
    "/reports/:path*",
    "/opening/:path*",
    "/products/:path*",
    "/masters/:path*",
  ],
};