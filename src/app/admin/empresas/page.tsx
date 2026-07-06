import { getServerSession } from "next-auth";
import { redirect }         from "next/navigation";
import { authOptions }      from "@/lib/auth";
import { Rol }              from "@/generated/prisma/enums";
import prisma               from "@/lib/prisma";
import EmpresasClient       from "./EmpresasClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Restaurantes — Admin Comandas" };

export default async function EmpresasPage() {
  const session = await getServerSession(authOptions);
  if ((session?.user.rol as Rol) !== Rol.SUPERADMIN) redirect("/admin");

  const empresas = await prisma.empresa.findMany({
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

  // Totales por empresa (comandas hoy y total)
  const TZ  = "America/Panama";
  const hoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: TZ }) + "T00:00:00-05:00");

  type EmpMetrics = { empresa_id: string; total: bigint; hoy: bigint };
  const metrics = await prisma.$queryRaw<EmpMetrics[]>`
    SELECT l.empresa_id,
           COUNT(c.id)::bigint AS total,
           COUNT(CASE WHEN c.lista_at >= ${hoy} THEN 1 END)::bigint AS hoy
    FROM locales l
    LEFT JOIN comandas c ON c.local_id = l.id
    WHERE l.empresa_id IS NOT NULL
    GROUP BY l.empresa_id
  `;

  const metricMap = new Map(metrics.map(m => [m.empresa_id, {
    total: Number(m.total),
    hoy:   Number(m.hoy),
  }]));

  const empresasData = empresas.map(e => ({
    ...e,
    comandasTotal: metricMap.get(e.id)?.total ?? 0,
    comandasHoy:   metricMap.get(e.id)?.hoy   ?? 0,
  }));

  return <EmpresasClient empresasIniciales={empresasData} />;
}
