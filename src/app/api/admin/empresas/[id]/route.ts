import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { z }                         from "zod";
import { authOptions }               from "@/lib/auth";
import prisma                        from "@/lib/prisma";
import { Rol }                       from "@/generated/prisma/enums";

function requireSuperadmin(session: { user: { rol: Rol } } | null) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.rol !== Rol.SUPERADMIN)
    return NextResponse.json({ error: "Solo SUPERADMIN puede gestionar restaurantes" }, { status: 403 });
  return null;
}

const updateSchema = z.object({
  nombre:   z.string().trim().min(2).max(100).optional(),
  ruc:      z.string().trim().max(30).optional().nullable(),
  contacto: z.string().trim().max(80).optional().nullable(),
  email:    z.string().trim().email().optional().nullable().or(z.literal("")),
  telefono: z.string().trim().max(20).optional().nullable(),
  activo:   z.boolean().optional(),
});

// GET /api/admin/empresas/[id] — detalle con locales, usuarios y métricas
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = session.user.rol as Rol;
  if (rol !== Rol.SUPERADMIN && rol !== Rol.ADMIN_LOCAL)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const { id } = await params;

  // ADMIN_LOCAL solo puede ver su propia empresa
  if (rol === Rol.ADMIN_LOCAL && session.user.empresaId !== id)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const empresa = await prisma.empresa.findUnique({
    where:  { id },
    select: {
      id: true, nombre: true, ruc: true, contacto: true,
      email: true, telefono: true, activo: true, createdAt: true,
      suscripcion: {
        select: {
          id: true, estado: true, montoMensual: true,
          fechaInicio: true, fechaVencimiento: true, notas: true,
          pagos: { orderBy: { fecha: "desc" }, take: 20,
                   select: { id: true, monto: true, fecha: true, referencia: true, notas: true } },
        },
      },
      locales: {
        orderBy: { nombre: "asc" },
        select: {
          id: true, nombre: true, slug: true, activo: true,
          displayToken: true, umbralAmarilloMin: true, umbralRojoMin: true,
          _count: { select: { usuarios: true, comandas: true } },
        },
      },
      usuarios: {
        orderBy: { nombre: "asc" },
        select: {
          id: true, nombre: true, email: true, rol: true, activo: true,
          local: { select: { id: true, nombre: true } },
        },
      },
    },
  });

  if (!empresa) return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 });
  return NextResponse.json({ empresa });
}

// PUT /api/admin/empresas/[id] — solo SUPERADMIN
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const err = requireSuperadmin(session); if (err) return err;

  const { id } = await params;
  const body   = await req.json().catch(() => null);
  const parse  = updateSchema.safeParse(body);
  if (!parse.success) return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });

  const exists = await prisma.empresa.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 });

  const data = { ...parse.data, email: parse.data.email || null };
  const empresa = await prisma.empresa.update({ where: { id }, data,
    select: { id: true, nombre: true, ruc: true, contacto: true, email: true, telefono: true, activo: true } });

  return NextResponse.json({ empresa });
}

// DELETE /api/admin/empresas/[id] — solo SUPERADMIN
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const err = requireSuperadmin(session); if (err) return err;

  const { id } = await params;

  const localesActivos = await prisma.local.count({ where: { empresaId: id } });
  if (localesActivos > 0)
    return NextResponse.json({ error: `No se puede eliminar: tiene ${localesActivos} local(es)` }, { status: 409 });

  await prisma.empresa.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
