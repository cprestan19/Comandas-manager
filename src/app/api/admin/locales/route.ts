import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { z }                         from "zod";
import { authOptions }               from "@/lib/auth";
import prisma                        from "@/lib/prisma";
import { Rol }                       from "@/generated/prisma/enums";

interface AdminSess { user: { rol: Rol; empresaId: string | null } }
function requireAdmin(session: AdminSess | null) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { rol } = session.user;
  if (rol !== Rol.SUPERADMIN && rol !== Rol.ADMIN_LOCAL)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  return null;
}

const localSchema = z.object({
  empresaId:             z.string().min(1, "Restaurante requerido"),
  nombre:                z.string().trim().min(2, "Mínimo 2 caracteres").max(80),
  slug:                  z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
  descripcion:           z.string().trim().max(300).optional().nullable(),
  umbralAmarilloMin:     z.number().int().min(1).max(60).default(3),
  umbralRojoMin:         z.number().int().min(1).max(120).default(7),
  tiempoDesaparicionMin: z.number().int().min(0).max(60).default(0),
});

// GET /api/admin/locales
// SUPERADMIN: todos. ADMIN_LOCAL: solo los de su empresa.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = requireAdmin(session); if (err) return err;

  const rol       = session!.user.rol as Rol;
  const empresaId = (session!.user as { empresaId: string | null }).empresaId;

  const where = rol === Rol.ADMIN_LOCAL && empresaId
    ? { empresaId }
    : {};

  const locales = await prisma.local.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true, nombre: true, slug: true, descripcion: true, activo: true,
      displayToken: true, umbralAmarilloMin: true, umbralRojoMin: true, tiempoDesaparicionMin: true,
      empresaId: true,
      empresa: { select: { id: true, nombre: true } },
      _count: { select: { usuarios: true, comandas: true } },
    },
  });

  return NextResponse.json({ locales });
}

// POST /api/admin/locales — solo SUPERADMIN puede crear locales
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = requireAdmin(session); if (err) return err;

  if ((session!.user.rol as Rol) !== Rol.SUPERADMIN)
    return NextResponse.json({ error: "Solo SUPERADMIN puede crear locales" }, { status: 403 });

  const body  = await req.json().catch(() => null);
  const parse = localSchema.safeParse(body);
  if (!parse.success) return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });

  const { empresaId, nombre, slug, descripcion, umbralAmarilloMin, umbralRojoMin, tiempoDesaparicionMin } = parse.data;

  const empresaExiste = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true } });
  if (!empresaExiste) return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 });

  const existing = await prisma.local.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "El slug ya está en uso" }, { status: 409 });

  const local = await prisma.local.create({
    data: { empresaId, nombre, slug, descripcion: descripcion ?? null, umbralAmarilloMin, umbralRojoMin, tiempoDesaparicionMin },
    select: {
      id: true, nombre: true, slug: true, displayToken: true,
      umbralAmarilloMin: true, umbralRojoMin: true, tiempoDesaparicionMin: true,
      empresaId: true, empresa: { select: { id: true, nombre: true } },
    },
  });

  return NextResponse.json({ local }, { status: 201 });
}
