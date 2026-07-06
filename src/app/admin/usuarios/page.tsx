import { getServerSession } from "next-auth";
import { authOptions }      from "@/lib/auth";
import { Rol }              from "@/generated/prisma/enums";
import prisma               from "@/lib/prisma";
import UsuariosClient       from "./UsuariosClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuarios — Admin Comandas" };

export default async function UsuariosPage() {
  const session      = await getServerSession(authOptions);
  const rol          = session?.user.rol as Rol;
  const esSuperadmin = rol === Rol.SUPERADMIN;
  const empresaId    = session?.user.empresaId ?? null;

  const where = esSuperadmin ? {} : (empresaId ? { empresaId } : { id: "__none__" });

  const [usuarios, locales, empresas] = await Promise.all([
    prisma.usuario.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true, nombre: true, email: true, rol: true, activo: true,
        empresa: { select: { id: true, nombre: true } },
        local:   { select: { id: true, nombre: true } },
      },
    }),
    prisma.local.findMany({
      where:   { activo: true, ...(esSuperadmin ? {} : (empresaId ? { empresaId } : { id: "__none__" })) },
      orderBy: { nombre: "asc" },
      select:  { id: true, nombre: true, empresaId: true },
    }),
    esSuperadmin
      ? prisma.empresa.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } })
      : Promise.resolve([]),
  ]);

  return (
    <UsuariosClient
      usuariosIniciales={usuarios}
      locales={locales}
      empresas={empresas}
      esSuperadmin={esSuperadmin}
      miEmpresaId={empresaId}
    />
  );
}
