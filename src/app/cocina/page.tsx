import { getServerSession } from "next-auth";
import { redirect }          from "next/navigation";
import { authOptions }       from "@/lib/auth";
import CocinaClient          from "./CocinaClient";

export const metadata = { title: "Cocina — Comandas" };

export default async function CocinaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const user = session.user;

  return (
    <CocinaClient
      userName={user.nombre}
      userRole={user.rol}
    />
  );
}
