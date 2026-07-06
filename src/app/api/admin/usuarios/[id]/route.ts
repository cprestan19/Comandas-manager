import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { z }                         from "zod";
import bcrypt                        from "bcryptjs";
import { authOptions }               from "@/lib/auth";
import prisma                        from "@/lib/prisma";
import { Rol }                       from "@/generated/prisma/enums";

interface AdminSess { user: { id: string; rol: Rol; empresaId: string | null } }
function requireAdmin(session: AdminSess | null) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { rol } = session.user;
  if (rol !== Rol.SUPERADMIN && rol !== Rol.ADMIN_LOCAL)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  return null;
}

const updateSchema = z.object({
  nombre:   z.string().trim().min(2).max(80).optional(),
  password: z.string().min(6).optional(),
  rol:      z.enum([Rol.SUPERADMIN, Rol.ADMIN_LOCAL, Rol.COCINA]).optional(),
  localId:  z.string().optional().nullable(),
  activo:   z.boolean().optional(),
});

// PUT /api/admin/usuarios/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const err = requireAdmin(session); if (err) return err;

  const rolSesion  = session!.user.rol as Rol;
  const sesEmpId   = (session!.user as { empresaId: string | null }).empresaId;
  const { id }     = await params;

  const objetivo = await prisma.usuario.findUnique({ where: { id }, select: { rol: true, empresaId: true } });
  if (!objetivo) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  // ADMIN_LOCAL solo puede editar usuarios de su empresa
  if (rolSesion === Rol.ADMIN_LOCAL) {
    if (objetivo.empresaId !== sesEmpId)
      return NextResponse.json({ error: "Sin permiso sobre este usuario" }, { status: 403 });
    if (objetivo.rol === Rol.SUPERADMIN)
      return NextResponse.json({ error: "No puedes editar un SUPERADMIN" }, { status: 403 });
  }

  const body  = await req.json().catch(() => null);
  const parse = updateSchema.safeParse(body);
  if (!parse.success) return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });

  if (rolSesion === Rol.ADMIN_LOCAL && parse.data.rol === Rol.SUPERADMIN)
    return NextResponse.json({ error: "No puedes asignar el rol SUPERADMIN" }, { status: 403 });

  // Validar que el localId asignado pertenece a la empresa del usuario que edita
  if (parse.data.localId) {
    const localObj = await prisma.local.findUnique({
      where:  { id: parse.data.localId },
      select: { empresaId: true },
    });
    if (!localObj) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
    const empresaObjetivo = objetivo.empresaId ?? (parse.data as Record<string, unknown>).empresaId ?? null;
    if (rolSesion === Rol.ADMIN_LOCAL && localObj.empresaId !== sesEmpId)
      return NextResponse.json({ error: "El local no pertenece a tu restaurante" }, { status: 403 });
    if (rolSesion === Rol.SUPERADMIN && empresaObjetivo && localObj.empresaId !== empresaObjetivo)
      return NextResponse.json({ error: "El local no pertenece al restaurante del usuario" }, { status: 400 });
  }

  const data: Record<string, unknown> = { ...parse.data };
  if (parse.data.password) data.password = await bcrypt.hash(parse.data.password, 12);

  const usuario = await prisma.usuario.update({
    where:  { id },
    data,
    select: { id: true, nombre: true, email: true, rol: true, activo: true,
              empresa: { select: { id: true, nombre: true } },
              local:   { select: { id: true, nombre: true } } },
  });

  return NextResponse.json({ usuario });
}

// DELETE /api/admin/usuarios/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const err = requireAdmin(session); if (err) return err;

  const rolSesion = session!.user.rol as Rol;
  const sesEmpId  = (session!.user as { empresaId: string | null }).empresaId;
  const { id }    = await params;
  const selfId    = (session!.user as { id: string }).id;

  if (id === selfId) return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });

  const objetivo = await prisma.usuario.findUnique({ where: { id }, select: { rol: true, empresaId: true } });
  if (!objetivo) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (rolSesion === Rol.ADMIN_LOCAL) {
    if (objetivo.empresaId !== sesEmpId)
      return NextResponse.json({ error: "Sin permiso sobre este usuario" }, { status: 403 });
    if (objetivo.rol === Rol.SUPERADMIN)
      return NextResponse.json({ error: "No puedes eliminar un SUPERADMIN" }, { status: 403 });
  }

  await prisma.usuario.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
