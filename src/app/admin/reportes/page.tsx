import { getServerSession } from "next-auth";
import { redirect }         from "next/navigation";
import { authOptions }      from "@/lib/auth";
import prisma               from "@/lib/prisma";
import { Rol }              from "@/generated/prisma/enums";
import ReportesClient       from "./ReportesClient";

export const dynamic  = "force-dynamic";
export const metadata = { title: "Análisis de Efectividad — Comandas" };

export default async function ReportesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const rol = session.user.rol;
  if (rol !== Rol.SUPERADMIN && rol !== Rol.ADMIN_LOCAL) redirect("/admin");

  const locales = await prisma.local.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });

  return <ReportesClient locales={locales} />;
}
