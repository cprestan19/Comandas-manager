import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { z }                         from "zod";
import { authOptions }               from "@/lib/auth";
import prisma                        from "@/lib/prisma";
import { Rol }                       from "@/generated/prisma/enums";

// POST /api/admin/facturacion/pagos — registrar un pago contra una suscripción
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if ((session.user.rol as Rol) !== Rol.SUPERADMIN)
    return NextResponse.json({ error: "Solo SUPERADMIN puede registrar pagos" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parse = z.object({
    suscripcionId: z.string().min(1, "Suscripción requerida"),
    monto:         z.number().positive("El monto debe ser mayor a 0"),
    fecha:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    referencia:    z.string().trim().max(80).optional().nullable(),
    notas:         z.string().trim().max(300).optional().nullable(),
  }).safeParse(body);

  if (!parse.success) return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });
  const { suscripcionId, monto, fecha, referencia, notas } = parse.data;

  const suscripcion = await prisma.suscripcion.findUnique({ where: { id: suscripcionId }, select: { id: true } });
  if (!suscripcion) return NextResponse.json({ error: "Suscripción no encontrada" }, { status: 404 });

  const pago = await prisma.pago.create({
    data: {
      suscripcionId,
      monto,
      fecha:      fecha ? new Date(`${fecha}T12:00:00-05:00`) : new Date(),
      referencia: referencia ?? null,
      notas:      notas      ?? null,
    },
    select: { id: true, monto: true, fecha: true, referencia: true, notas: true },
  });

  return NextResponse.json({ pago }, { status: 201 });
}

// DELETE /api/admin/facturacion/pagos?id=... — eliminar un pago
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if ((session.user.rol as Rol) !== Rol.SUPERADMIN)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await prisma.pago.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
