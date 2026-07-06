import { NextRequest, NextResponse }     from "next/server";
import { getServerSession }              from "next-auth";
import { z }                             from "zod";
import { authOptions }                   from "@/lib/auth";
import prisma                            from "@/lib/prisma";
import { getEffectiveLocalId, AppError } from "@/lib/tenant";
import { pusherServer, displayChannel, PUSHER_EVENTS } from "@/lib/pusher";
import { EstadoComanda }                 from "@/generated/prisma/enums";

const crearSchema = z.object({
  numero: z
    .string()
    .trim()
    .min(1, "El número de comanda no puede estar vacío")
    .max(10, "Máximo 10 caracteres"),
});

// GET /api/comandas — lista las comandas LISTA del local del usuario autenticado
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const localId = getEffectiveLocalId(session);

    const comandas = await prisma.comanda.findMany({
      where:   { localId, estado: EstadoComanda.LISTA },
      select:  { id: true, numero: true, listaAt: true, estado: true },
      orderBy: { listaAt: "asc" },
    });

    return NextResponse.json({ comandas });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[GET /api/comandas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// POST /api/comandas — marca una comanda como LISTA (desde cocina)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const localId = getEffectiveLocalId(session);
    const usuarioId = session.user.id;

    const body  = await req.json().catch(() => null);
    const parse = crearSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });
    }

    const { numero } = parse.data;

    // Obtener displayToken del local para el canal Pusher
    const local = await prisma.local.findUnique({
      where:  { id: localId },
      select: { displayToken: true, activo: true },
    });
    if (!local || !local.activo) {
      return NextResponse.json({ error: "Local no encontrado o inactivo" }, { status: 404 });
    }

    const comanda = await prisma.comanda.create({
      data: { numero, localId, usuarioId, estado: EstadoComanda.LISTA },
      select: { id: true, numero: true, listaAt: true },
    });

    // Notificar al display en tiempo real
    await pusherServer.trigger(
      displayChannel(local.displayToken),
      PUSHER_EVENTS.COMANDA_NUEVA,
      { id: comanda.id, numero: comanda.numero, listaAt: comanda.listaAt.toISOString() },
    );

    return NextResponse.json({ comanda }, { status: 201 });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[POST /api/comandas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
