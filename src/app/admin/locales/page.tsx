import { getServerSession } from "next-auth";
import { authOptions }      from "@/lib/auth";
import { Rol }              from "@/generated/prisma/enums";
import prisma               from "@/lib/prisma";
import LocalesClient        from "./LocalesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Locales — Admin Comandas" };

export default async function LocalesPage() {
  const session     = await getServerSession(authOptions);
  const rol         = session?.user.rol as Rol;
  const esSuperadmin = rol === Rol.SUPERADMIN;
  const empresaId   = session?.user.empresaId ?? null;

  const [locales, empresas] = await Promise.all([
    prisma.local.findMany({
      where:   esSuperadmin ? {} : (empresaId ? { empresaId } : { id: "__none__" }),
      orderBy: { createdAt: "asc" },
      select: {
        id: true, nombre: true, slug: true, descripcion: true, activo: true,
        displayToken: true, umbralAmarilloMin: true, umbralRojoMin: true, tiempoDesaparicionMin: true,
        empresaId: true,
        empresa: { select: { id: true, nombre: true } },
        _count: { select: { usuarios: true, comandas: true } },
      },
    }),
    esSuperadmin
      ? prisma.empresa.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } })
      : Promise.resolve([]),
  ]);

  return <LocalesClient localesIniciales={locales} esSuperadmin={esSuperadmin} empresas={empresas} />;
}
