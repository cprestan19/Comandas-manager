import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { authOptions }               from "@/lib/auth";
import prisma                        from "@/lib/prisma";
import { Rol }                       from "@/generated/prisma/enums";

// GET /api/admin/login-logs?empresaId=&limit=50&exitoso=
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = session.user.rol as Rol;
  if (rol !== Rol.SUPERADMIN && rol !== Rol.ADMIN_LOCAL)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const sp         = new URL(req.url).searchParams;
  const limit      = Math.min(Number(sp.get("limit") ?? "100"), 500);
  const soloFallos = sp.get("exitoso") === "false";

  // Filtro por empresa usando relación — elimina el pre-fetch N+1
  const where: Record<string, unknown> = {};
  if (soloFallos) where.exitoso = false;
  if (rol === Rol.ADMIN_LOCAL && session.user.empresaId) {
    where.usuario = { empresaId: session.user.empresaId };
  }

  const logs = await prisma.loginLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take:    limit,
    select: {
      id: true, email: true, ip: true, exitoso: true,
      userAgent: true, createdAt: true,
      usuario: { select: { id: true, nombre: true, rol: true,
        empresa: { select: { id: true, nombre: true } },
        local:   { select: { id: true, nombre: true } },
      } },
    },
  });

  return NextResponse.json({ logs });
}
