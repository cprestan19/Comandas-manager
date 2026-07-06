import { getServerSession } from "next-auth";
import { redirect }         from "next/navigation";
import { authOptions }      from "@/lib/auth";
import { Rol }              from "@/generated/prisma/enums";
import prisma               from "@/lib/prisma";
import FacturacionClient    from "./FacturacionClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturación — Admin Comandas" };

export default async function FacturacionPage() {
  const session = await getServerSession(authOptions);
  if ((session?.user.rol as Rol) !== Rol.SUPERADMIN) redirect("/admin");

  const empresas = await prisma.empresa.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true, nombre: true, activo: true,
      _count: { select: { locales: true } },
      locales: { select: { id: true, nombre: true }, orderBy: { nombre: "asc" } },
      suscripcion: {
        select: {
          id: true, estado: true, montoMensual: true,
          fechaInicio: true, fechaVencimiento: true, notas: true,
          pagos: {
            orderBy: { fecha: "desc" }, take: 20,
            select: { id: true, monto: true, fecha: true, referencia: true, notas: true },
          },
        },
      },
    },
  });

  // Total pagado por empresa
  const totalesPagados = await prisma.pago.groupBy({
    by: ["suscripcionId"],
    _sum: { monto: true },
  });

  const suscripcionPagado = new Map(totalesPagados.map(t => [t.suscripcionId, t._sum.monto ?? 0]));

  const data = empresas.map(e => ({
    ...e,
    totalPagado: e.suscripcion ? (suscripcionPagado.get(e.suscripcion.id) ?? 0) : 0,
  }));

  return <FacturacionClient empresasIniciales={data} />;
}
