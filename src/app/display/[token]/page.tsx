import { notFound }    from "next/navigation";
import prisma           from "@/lib/prisma";
import { EstadoComanda } from "@/generated/prisma/enums";
import DisplayClient    from "./DisplayClient";

export const metadata = { title: "Display — Comandas" };

// Evitar caché — el display siempre carga datos frescos
export const dynamic = "force-dynamic";

interface Props {
  params:       Promise<{ token: string }>;
  searchParams: Promise<{ modo?: string }>;
}

export default async function DisplayPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { modo }  = await searchParams;
  const soloDisplay = modo === "pantalla";

  const local = await prisma.local.findUnique({
    where:  { displayToken: token },
    select: {
      id:                    true,
      nombre:                true,
      displayToken:          true,
      umbralAmarilloMin:     true,
      umbralRojoMin:         true,
      tiempoDesaparicionMin: true,
      activo:                true,
    },
  });

  if (!local || !local.activo) notFound();

  // Si hay tiempo de desaparición, excluir comandas que ya lo superaron
  const listaAtMinima = local.tiempoDesaparicionMin > 0
    ? new Date(Date.now() - local.tiempoDesaparicionMin * 60 * 1000)
    : undefined;

  const comandasIniciales = await prisma.comanda.findMany({
    where: {
      localId: local.id,
      estado:  EstadoComanda.LISTA,
      ...(listaAtMinima ? { listaAt: { gte: listaAtMinima } } : {}),
    },
    select:  { id: true, numero: true, listaAt: true },
    orderBy: { listaAt: "asc" },
  });

  return (
    <DisplayClient
      localNombre={local.nombre}
      displayToken={local.displayToken}
      umbralAmarilloMin={local.umbralAmarilloMin}
      umbralRojoMin={local.umbralRojoMin}
      tiempoDesaparicionMin={local.tiempoDesaparicionMin}
      soloDisplay={soloDisplay}
      comandasIniciales={comandasIniciales.map((c: { id: string; numero: string; listaAt: Date }) => ({
        id:      c.id,
        numero:  c.numero,
        listaAt: c.listaAt.toISOString(),
      }))}
    />
  );
}
