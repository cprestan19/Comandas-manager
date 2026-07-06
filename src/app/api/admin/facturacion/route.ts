import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { z }                         from "zod";
import { authOptions }               from "@/lib/auth";
import prisma                        from "@/lib/prisma";
import { Rol, EstadoSuscripcion }    from "@/generated/prisma/enums";

function requireSuperadmin(session: { user: { rol: Rol } } | null) {
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.user.rol !== Rol.SUPERADMIN)
    return NextResponse.json({ error: "Solo SUPERADMIN puede gestionar facturación" }, { status: 403 });
  return null;
}

// GET /api/admin/facturacion
// Devuelve todas las empresas con su suscripción y últimos pagos
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = requireSuperadmin(session); if (err) return err;

  const empresas = await prisma.empresa.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true, nombre: true, activo: true,
      _count: { select: { locales: true } },
      suscripcion: {
        select: {
          id: true, estado: true, montoMensual: true,
          fechaInicio: true, fechaVencimiento: true, notas: true,
          pagos: {
            orderBy: { fecha: "desc" }, take: 5,
            select: { id: true, monto: true, fecha: true, referencia: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ empresas });
}

const suscripcionSchema = z.object({
  empresaId:        z.string().min(1, "Selecciona un restaurante"),
  montoMensual:     z.number().positive("El monto debe ser mayor a 0"),
  fechaInicio:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  estado:           z.nativeEnum(EstadoSuscripcion).default(EstadoSuscripcion.ACTIVA),
  notas:            z.string().trim().max(500).optional().nullable(),
});

// POST /api/admin/facturacion — crear o actualizar suscripción de una empresa
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const err = requireSuperadmin(session); if (err) return err;

  const body  = await req.json().catch(() => null);
  const parse = suscripcionSchema.safeParse(body);
  if (!parse.success) return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });

  const { empresaId, montoMensual, fechaInicio, fechaVencimiento, estado, notas } = parse.data;

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true } });
  if (!empresa) return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 });

  const suscripcion = await prisma.suscripcion.upsert({
    where:  { empresaId },
    create: {
      empresaId, montoMensual, estado,
      notas: notas ?? null,
      fechaInicio:      new Date(`${fechaInicio}T00:00:00-05:00`),
      fechaVencimiento: new Date(`${fechaVencimiento}T23:59:59-05:00`),
    },
    update: {
      montoMensual, estado,
      notas: notas ?? null,
      fechaInicio:      new Date(`${fechaInicio}T00:00:00-05:00`),
      fechaVencimiento: new Date(`${fechaVencimiento}T23:59:59-05:00`),
    },
    select: { id: true, estado: true, montoMensual: true, fechaInicio: true, fechaVencimiento: true },
  });

  return NextResponse.json({ suscripcion }, { status: 201 });
}
