import { NextRequest, NextResponse } from "next/server";
import bcrypt                        from "bcryptjs";
import prisma                        from "@/lib/prisma";
import { Rol }                       from "@/generated/prisma/enums";

// POST /api/seed — crea el SUPERADMIN inicial
// Protegido con SEED_SECRET. Agrega ?reset=true para borrar todos los datos primero.
// Deshabilitado en producción para evitar resets accidentales.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "No disponible en producción" }, { status: 405 });

  const secret = process.env.SEED_SECRET ?? "";
  if (!secret || req.headers.get("x-seed-secret") !== secret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const reset = new URL(req.url).searchParams.get("reset") === "true";

  if (reset) {
    await prisma.loginLog.deleteMany();
    await prisma.pago.deleteMany();
    await prisma.suscripcion.deleteMany();
    await prisma.comanda.deleteMany();
    await prisma.usuario.deleteMany();
    await prisma.local.deleteMany();
    await prisma.empresa.deleteMany();
  } else {
    const existe = await prisma.usuario.findFirst({ where: { rol: Rol.SUPERADMIN }, select: { id: true } });
    if (existe) {
      return NextResponse.json({ ok: true, mensaje: "Ya existe un SUPERADMIN. Seed omitido." });
    }
  }

  const hash = await bcrypt.hash("Admin123!", 12);

  await prisma.usuario.create({
    data: { nombre: "Super Admin", email: "admin@comandas.com", password: hash, rol: Rol.SUPERADMIN },
  });

  console.info("[seed] SUPERADMIN creado: admin@comandas.com / Admin123!");

  return NextResponse.json({
    ok: true,
    mensaje: reset ? "Datos reseteados. SUPERADMIN creado." : "SUPERADMIN creado.",
    pasos: [
      "1. /admin/empresas → crear restaurante",
      "2. /admin/locales → crear sucursales",
      "3. /admin/usuarios → crear usuarios",
    ],
  });
}
