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

const crearSchema = z.object({
  nombre:   z.string().trim().min(2, "Mínimo 2 caracteres").max(100),
  ruc:      z.string().trim().max(30).optional().nullable(),
  contacto: z.string().trim().max(80).optional().nullable(),
  email:    z.string().trim().email("Email inválido").optional().nullable().or(z.literal("")),
  telefono: z.string().trim().max(20).optional().nullable(),
});

// GET /api/admin/empresas
// SUPERADMIN: todas + métricas. ADMIN_LOCAL: solo la suya.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = session.user.rol as Rol;
  if (rol !== Rol.SUPERADMIN && rol !== Rol.ADMIN_LOCAL)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const where = rol === Rol.ADMIN_LOCAL
    ? { id: session.user.empresaId ?? "__none__" }
    : {};

  const empresas = await prisma.empresa.findMany({
    where,
    orderBy: { nombre: "asc" },
    select: {
      id: true, nombre: true, ruc: true, contacto: true,
      email: true, telefono: true, activo: true, createdAt: true,
      suscripcion: {
        select: { estado: true, fechaVencimiento: true, montoMensual: true },
      },
      _count: { select: { locales: true, usuarios: true } },
    },
  });

  return NextResponse.json({ empresas });
}

// POST /api/admin/empresas — solo SUPERADMIN
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = requireSuperadmin(session); if (err) return err;

  const body  = await req.json().catch(() => null);
  const parse = crearSchema.safeParse(body);
  if (!parse.success) return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });

  const { nombre, ruc, contacto, email, telefono } = parse.data;

  const empresa = await prisma.empresa.create({
    data: {
      nombre,
      ruc:      ruc      ?? null,
      contacto: contacto ?? null,
      email:    email    || null,
      telefono: telefono ?? null,
    },
    select: { id: true, nombre: true, ruc: true, contacto: true, email: true, telefono: true, activo: true, createdAt: true },
  });

  return NextResponse.json({ empresa }, { status: 201 });
}
