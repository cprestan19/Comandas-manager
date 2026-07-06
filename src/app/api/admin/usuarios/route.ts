import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { z }                         from "zod";
import bcrypt                        from "bcryptjs";
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

const crearSchema = z.object({
  nombre:    z.string().trim().min(2).max(80),
  email:     z.string().trim().email("Email inválido").toLowerCase(),
  password:  z.string().min(6, "Mínimo 6 caracteres"),
  rol:       z.enum([Rol.SUPERADMIN, Rol.ADMIN_LOCAL, Rol.COCINA]),
  empresaId: z.string().min(1, "Restaurante requerido").optional(),
  localId:   z.string().min(1, "Selecciona un local para el usuario de Cocina").optional().nullable(),
});

// GET /api/admin/usuarios
// SUPERADMIN: todos. ADMIN_LOCAL: solo los de su empresa.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = requireAdmin(session); if (err) return err;

  const rol       = session!.user.rol as Rol;
  const empresaId = (session!.user as { empresaId: string | null }).empresaId;

  const where = rol === Rol.ADMIN_LOCAL && empresaId
    ? { empresaId }
    : {};

  const usuarios = await prisma.usuario.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true, nombre: true, email: true, rol: true, activo: true,
      empresa: { select: { id: true, nombre: true } },
      local:   { select: { id: true, nombre: true } },
    },
  });

  return NextResponse.json({ usuarios });
}

// POST /api/admin/usuarios
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = requireAdmin(session); if (err) return err;

  const rolSesion = session!.user.rol as Rol;
  const sesEmpresaId = (session!.user as { empresaId: string | null }).empresaId;

  const body  = await req.json().catch(() => null);
  const parse = crearSchema.safeParse(body);
  if (!parse.success) return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });

  const datos = parse.data;

  // ADMIN_LOCAL no puede crear SUPERADMINs
  if (rolSesion === Rol.ADMIN_LOCAL && datos.rol === Rol.SUPERADMIN)
    return NextResponse.json({ error: "No tienes permiso para crear SUPERADMIN" }, { status: 403 });

  // Resolver empresaId
  let empresaId: string | null = null;
  if (datos.rol !== Rol.SUPERADMIN) {
    if (rolSesion === Rol.ADMIN_LOCAL) {
      // ADMIN_LOCAL siempre crea usuarios en su empresa
      empresaId = sesEmpresaId;
    } else {
      // SUPERADMIN debe especificar la empresa
      if (!datos.empresaId)
        return NextResponse.json({ error: "Debes seleccionar un restaurante" }, { status: 400 });
      const empExiste = await prisma.empresa.findUnique({ where: { id: datos.empresaId }, select: { id: true } });
      if (!empExiste) return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 });
      empresaId = datos.empresaId;
    }
  }

  // COCINA requiere localId; otros no
  let localId: string | null = null;
  if (datos.rol === Rol.COCINA) {
    if (!datos.localId)
      return NextResponse.json({ error: "COCINA requiere un local asignado" }, { status: 400 });
    const localExiste = await prisma.local.findUnique({ where: { id: datos.localId }, select: { id: true, empresaId: true } });
    if (!localExiste) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
    // Validar que el local pertenece a la misma empresa
    if (empresaId && localExiste.empresaId !== empresaId)
      return NextResponse.json({ error: "El local no pertenece al restaurante seleccionado" }, { status: 400 });
    localId = datos.localId;
  }

  const existe = await prisma.usuario.findUnique({ where: { email: datos.email }, select: { id: true } });
  if (existe) return NextResponse.json({ error: "El email ya está registrado" }, { status: 409 });

  const hashed  = await bcrypt.hash(datos.password, 12);
  const usuario = await prisma.usuario.create({
    data:   { nombre: datos.nombre, email: datos.email, password: hashed, rol: datos.rol, empresaId, localId },
    select: { id: true, nombre: true, email: true, rol: true,
              empresa: { select: { id: true, nombre: true } },
              local:   { select: { id: true, nombre: true } } },
  });

  return NextResponse.json({ usuario }, { status: 201 });
}
