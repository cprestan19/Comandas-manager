import { NextRequest, NextResponse } from "next/server";
import { getToken }                  from "next-auth/jwt";

// ─── Rate limiting simple en memoria ─────────────────────────────────────────
const rateMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now   = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// Rutas de API que son públicas (no requieren sesión)
function isPublicApi(pathname: string, method: string): boolean {
  if (pathname.startsWith("/api/auth/"))  return true;
  if (pathname.startsWith("/api/seed"))   return true;  // protegida por x-seed-secret, no por sesión
  // Retirar comanda: público via header x-display-token
  if (pathname.match(/^\/api\/comandas\/[^/]+\/retirar$/) && method === "PATCH") return true;
  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

  // ── Rate limit: login (anti brute-force) — 10 intentos / 5 min por IP ────
  if (pathname === "/api/auth/callback/credentials" && req.method === "POST") {
    if (!rateLimit(ip, 10, 5 * 60_000)) {
      return NextResponse.json(
        { error: "Demasiados intentos de acceso. Espera 5 minutos." },
        { status: 429, headers: { "Retry-After": "300" } },
      );
    }
  }

  // ── Rate limit: retirar comanda (público) — 60 req/min por IP ────────────
  if (pathname.match(/^\/api\/comandas\/[^/]+\/retirar$/) && req.method === "PATCH") {
    if (!rateLimit(ip, 60, 60_000)) {
      return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
    }
  }

  // ── Rate limit POST /api/comandas — 30 req/min por IP ────────────────────
  if (pathname === "/api/comandas" && req.method === "POST") {
    if (!rateLimit(ip, 30, 60_000)) {
      return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
    }
  }

  // ── Rutas de página públicas ───────────────────────────────────────────────
  if (pathname.startsWith("/login") || pathname.startsWith("/display/")) {
    return NextResponse.next();
  }

  // ── APIs públicas ─────────────────────────────────────────────────────────
  if (isPublicApi(pathname, req.method)) {
    return NextResponse.next();
  }

  // ── Proteger rutas de cocina / admin (redirige a login) ───────────────────
  if (pathname.startsWith("/cocina") || pathname.startsWith("/admin")) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ── Proteger todas las demás API routes ───────────────────────────────────
  if (pathname.startsWith("/api/")) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/cocina/:path*",
    "/admin/:path*",
    "/api/:path*",
    "/login",
  ],
};
