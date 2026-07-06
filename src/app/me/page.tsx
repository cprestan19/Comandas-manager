import { getServerSession } from "next-auth";
import { redirect }          from "next/navigation";
import { authOptions }       from "@/lib/auth";
import { Rol }               from "@/generated/prisma/enums";

// Redirige al destino correcto según el rol del usuario
export default async function MePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const rol = session.user.rol as Rol;
  if (rol === Rol.SUPERADMIN || rol === Rol.ADMIN_LOCAL) redirect("/admin");
  redirect("/cocina");
}
