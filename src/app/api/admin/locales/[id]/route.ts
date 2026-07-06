import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { z }                         from "zod";
import { authOptions }               from "@/lib/auth";
import prisma                        from "@/lib/prisma";
import { Rol }                       from "@/generated/prisma/enums";

interface AdminSess { user: { rol: Rol; empresaId?: string | null } }
function requireAdmin(session: AdminSess | null) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { rol } = session.user;
  if (rol !== Rol.SUPERADMIN && rol !== Rol.ADMIN_LOCAL)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  return null;
}

const updateSchema = z.object({
  nombre:               z.string().trim().min(2).max(80).optional(),
  descripcion:          z.string().trim().max(300).optional().nullable(),
  umbralAmarilloMin:    z.number().int().min(1).max(60).optional(),
  umbralRojoMin:        z.number().int().min(1).max(120).optional(),
  tiempoDesaparicionMin: z.number().int().min(0).max(60).optional(),
  activo:               z.boolean().optional(),
});

// PUT /api/admin/locales/[id] — ambos roles pueden editar cualquier local
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const err = requireAdmin(session); if (err) return err;

  const rolSesion  = session!.user.rol as Rol;
  const sesEmpresaId = (session!.user as { empresaId?: string | null }).empresaId ?? null;

  const { id } = await params;
  const body   = await req.json().catch(() => null);
  const parse  = updateSchema.safeParse(body);
  if (!parse.success) return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });

  const local = await prisma.local.findUnique({ where: { id }, select: { id: true, empresaId: true } });
  if (!local) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });

  if (rolSesion === Rol.ADMIN_LOCAL && local.empresaId !== sesEmpresaId)
    return NextResponse.json({ error: "Sin permiso sobre este local" }, { status: 403 });

  const updated = await prisma.local.update({
    where:  { id },
    data:   parse.data,
    select: { id: true, nombre: true, slug: true, activo: true, umbralAmarilloMin: true, umbralRojoMin: true, tiempoDesaparicionMin: true },
  });

  return NextResponse.json({ local: updated });
}

// DELETE /api/admin/locales/[id] — solo SUPERADMIN puede eliminar locales
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const err = requireAdmin(session); if (err) return err;

  if ((session!.user.rol as Rol) !== Rol.SUPERADMIN)
    return NextResponse.json({ error: "Solo SUPERADMIN puede eliminar locales" }, { status: 403 });

  const { id } = await params;

  const comandasActivas = await prisma.comanda.count({
    where: { localId: id, estado: "LISTA" },
  });
  if (comandasActivas > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: hay ${comandasActivas} comanda(s) activa(s)` },
      { status: 409 },
    );
  }

  await prisma.local.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
