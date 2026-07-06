import { NextRequest, NextResponse }     from "next/server";
import { getServerSession }              from "next-auth";
import { authOptions }                   from "@/lib/auth";
import prisma                            from "@/lib/prisma";
import { getEffectiveLocalId, AppError } from "@/lib/tenant";
import { pusherServer, displayChannel, PUSHER_EVENTS } from "@/lib/pusher";
import { EstadoComanda }                 from "@/generated/prisma/enums";

// DELETE /api/comandas/deshacer
// Elimina la última comanda en estado LISTA del local (un cocinero a la vez).
// Solo accesible para usuarios autenticados con rol COCINA o ADMIN_LOCAL.
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const localId = getEffectiveLocalId(session);

    const ultima = await prisma.comanda.findFirst({
      where:   { localId, estado: EstadoComanda.LISTA },
      orderBy: { listaAt: "desc" },
      select:  { id: true, numero: true },
    });

    if (!ultima) {
      return NextResponse.json({ error: "No hay comandas pendientes para deshacer" }, { status: 404 });
    }

    await prisma.comanda.delete({ where: { id: ultima.id } });

    // Obtener displayToken para notificar al display
    const local = await prisma.local.findUnique({
      where:  { id: localId },
      select: { displayToken: true },
    });

    if (local) {
      await pusherServer.trigger(
        displayChannel(local.displayToken),
        PUSHER_EVENTS.COMANDA_RETIRADA, // reutilizamos el mismo evento: "quitar del display"
        { id: ultima.id, numero: ultima.numero },
      );
    }

    return NextResponse.json({ ok: true, deshecho: ultima });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[DELETE /api/comandas/deshacer]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
