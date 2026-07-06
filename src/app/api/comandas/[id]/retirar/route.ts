import { NextRequest, NextResponse } from "next/server";
import { z }                         from "zod";
import prisma                        from "@/lib/prisma";
import { pusherServer, displayChannel, PUSHER_EVENTS } from "@/lib/pusher";
import { EstadoComanda }             from "@/generated/prisma/enums";

// El token del display va en el header X-Display-Token para que esta ruta
// sea pública (sin login) pero no adivinable. La UI del display lo inyecta.
const tokenSchema = z.string().min(10);

// PATCH /api/comandas/[id]/retirar — marca la comanda como RETIRADA (desde display, público)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const displayToken = req.headers.get("x-display-token") ?? "";
    if (!tokenSchema.safeParse(displayToken).success) {
      return NextResponse.json({ error: "Token inválido" }, { status: 403 });
    }

    // Validar que la comanda pertenece al local con ese displayToken
    const comanda = await prisma.comanda.findFirst({
      where: {
        id,
        estado: EstadoComanda.LISTA,
        local:  { displayToken },
      },
      select: { id: true, numero: true, localId: true, local: { select: { displayToken: true } } },
    });

    if (!comanda) {
      return NextResponse.json({ error: "Comanda no encontrada o ya retirada" }, { status: 404 });
    }

    const updated = await prisma.comanda.update({
      where: { id },
      data:  { estado: EstadoComanda.RETIRADA, retiradaAt: new Date() },
      select: { id: true, numero: true, retiradaAt: true },
    });

    // Notificar al display
    await pusherServer.trigger(
      displayChannel(comanda.local.displayToken),
      PUSHER_EVENTS.COMANDA_RETIRADA,
      { id: updated.id, numero: updated.numero },
    );

    return NextResponse.json({ ok: true, comanda: updated });
  } catch (err) {
    console.error("[PATCH /api/comandas/[id]/retirar]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
