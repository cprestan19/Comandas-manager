import { getServerSession } from "next-auth";
import { redirect }          from "next/navigation";
import { authOptions }       from "@/lib/auth";
import { Rol }               from "@/generated/prisma/enums";
import AdminNav              from "./AdminNav";

export const metadata = { title: "Admin — Comandas" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const rol = session.user.rol as Rol;
  if (rol !== Rol.SUPERADMIN && rol !== Rol.ADMIN_LOCAL) redirect("/cocina");

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <AdminNav userName={session.user.nombre} userRole={rol} />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
