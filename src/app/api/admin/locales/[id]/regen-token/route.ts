import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { authOptions }               from "@/lib/auth";
import prisma                        from "@/lib/prisma";
import { Rol }                       from "@/generated/prisma/enums";
import { createId }                  from "@paralleldrive/cuid2";

// POST /api/admin/locales/[id]/regen-token
// Regenera el displayToken del local (invalida la URL anterior del display)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol = session.user.rol as Rol;
  if (rol !== Rol.SUPERADMIN) return NextResponse.json({ error: "Solo SUPERADMIN" }, { status: 403 });

  const { id } = await params;

  const local = await prisma.local.findUnique({ where: { id }, select: { id: true } });
  if (!local) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });

  const newToken = createId();
  const updated  = await prisma.local.update({
    where:  { id },
    data:   { displayToken: newToken },
    select: { id: true, nombre: true, displayToken: true },
  });

  return NextResponse.json({ local: updated });
}
