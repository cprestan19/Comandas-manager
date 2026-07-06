import { NextRequest, NextResponse } from "next/server";
import { getServerSession }          from "next-auth";
import { authOptions }               from "@/lib/auth";
import prisma                        from "@/lib/prisma";
import { Rol }                       from "@/generated/prisma/enums";

const TZ = "America/Panama";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function startOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00-05:00`);
}

function endOfDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999-05:00`);
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const rol       = session.user.rol as Rol;
  const empresaId = session.user.empresaId;
  if (rol !== Rol.SUPERADMIN && rol !== Rol.ADMIN_LOCAL)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const sp      = new URL(req.url).searchParams;
  const desdeStr = sp.get("desde") ?? todayStr();
  const hastaStr = sp.get("hasta") ?? todayStr();

  if (!isValidDate(desdeStr) || !isValidDate(hastaStr))
    return NextResponse.json({ error: "Fechas inválidas" }, { status: 400 });

  const desde = startOfDay(desdeStr);
  const hasta  = endOfDay(hastaStr);

  // Filtro de local opcional (dentro de la empresa del usuario)
  const localIdParam = sp.get("localId") ?? "";

  // Obtener los local IDs permitidos según el rol
  let localIdsPermitidos: string[] | null = null;
  if (rol === Rol.ADMIN_LOCAL && empresaId) {
    const ls = await prisma.local.findMany({ where: { empresaId }, select: { id: true } });
    localIdsPermitidos = ls.map(l => l.id);
  }

  // Construir la cláusula WHERE base para comandas
  let localFilterClause = "";
  const params: unknown[] = [desde, hasta];

  if (localIdParam) {
    // Validar que el local pertenece a los permitidos
    if (localIdsPermitidos && !localIdsPermitidos.includes(localIdParam)) {
      return NextResponse.json({ error: "Sin permiso sobre ese local" }, { status: 403 });
    }
    params.push(localIdParam);
    localFilterClause = `AND c.local_id = $${params.length}`;
  } else if (localIdsPermitidos && localIdsPermitidos.length > 0) {
    // ADMIN_LOCAL: todos sus locales
    const placeholders = localIdsPermitidos.map((_, i) => `$${params.length + i + 1}`).join(",");
    params.push(...localIdsPermitidos);
    localFilterClause = `AND c.local_id IN (${placeholders})`;
  } else if (localIdsPermitidos && localIdsPermitidos.length === 0) {
    return NextResponse.json({
      periodo: { desde: desdeStr, hasta: hastaStr },
      totales: { total: 0, retiradas: 0, pendientes: 0, verde: 0, amarillo: 0, rojo: 0, efectividad: 0, tasaRetiro: 0, avgEsperaSeg: null },
      porDia:   [],
      porLocal: [],
    });
  }

  const URGENCY_COUNTS = `
    COUNT(c.id) FILTER (WHERE c.estado = 'LISTA')::bigint    AS pendientes,
    COUNT(c.id) FILTER (WHERE c.estado = 'RETIRADA')::bigint AS retiradas,
    COUNT(c.id) FILTER (
      WHERE c.estado = 'RETIRADA' AND c.retirada_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (c.retirada_at - c.lista_at))/60 < l."umbralAmarilloMin"
    )::bigint AS verde,
    COUNT(c.id) FILTER (
      WHERE c.estado = 'RETIRADA' AND c.retirada_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (c.retirada_at - c.lista_at))/60 >= l."umbralAmarilloMin"
        AND EXTRACT(EPOCH FROM (c.retirada_at - c.lista_at))/60 < l."umbralRojoMin"
    )::bigint AS amarillo,
    COUNT(c.id) FILTER (
      WHERE c.estado = 'RETIRADA' AND c.retirada_at IS NOT NULL
        AND EXTRACT(EPOCH FROM (c.retirada_at - c.lista_at))/60 >= l."umbralRojoMin"
    )::bigint AS rojo,
    AVG(EXTRACT(EPOCH FROM (c.retirada_at - c.lista_at)))
      FILTER (WHERE c.retirada_at IS NOT NULL) AS avg_seg
  `;

  type SumRow = { pendientes: bigint; retiradas: bigint; verde: bigint; amarillo: bigint; rojo: bigint; avg_seg: number | null };
  type DiaRow = SumRow & { fecha: string };
  type LocalRow = SumRow & { id: string; nombre: string };

  const [sumRows, diaRows, localRows] = await Promise.all([
    prisma.$queryRawUnsafe<SumRow[]>(`
      SELECT ${URGENCY_COUNTS}
      FROM comandas c JOIN locales l ON c.local_id = l.id
      WHERE c.lista_at >= $1 AND c.lista_at <= $2 ${localFilterClause}
    `, ...params),

    prisma.$queryRawUnsafe<DiaRow[]>(`
      SELECT
        TO_CHAR(c.lista_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Panama', 'YYYY-MM-DD') AS fecha,
        ${URGENCY_COUNTS}
      FROM comandas c JOIN locales l ON c.local_id = l.id
      WHERE c.lista_at >= $1 AND c.lista_at <= $2 ${localFilterClause}
      GROUP BY fecha ORDER BY fecha ASC
    `, ...params),

    (() => {
      // Params propios para esta query: no reutilizar el array principal
      const p3: unknown[] = [desde, hasta];
      let whereEmpresa = "";
      let whereLocal   = "";
      if (rol === Rol.ADMIN_LOCAL && empresaId) {
        p3.push(empresaId);
        whereEmpresa = `AND l.empresa_id = $${p3.length}`;
      }
      if (localIdParam) {
        p3.push(localIdParam);
        whereLocal = `AND l.id = $${p3.length}`;
      }
      return prisma.$queryRawUnsafe<LocalRow[]>(`
        SELECT l.id, l.nombre, ${URGENCY_COUNTS}
        FROM locales l
        LEFT JOIN comandas c ON c.local_id = l.id AND c.lista_at >= $1 AND c.lista_at <= $2
        WHERE 1=1 ${whereEmpresa} ${whereLocal}
        GROUP BY l.id, l.nombre, l."umbralAmarilloMin", l."umbralRojoMin"
        ORDER BY l.nombre
      `, ...p3);
    })(),
  ]);

  const s          = sumRows[0];
  const retiradas  = Number(s?.retiradas ?? 0);
  const verde      = Number(s?.verde ?? 0);
  const amarillo   = Number(s?.amarillo ?? 0);
  const rojo       = Number(s?.rojo ?? 0);
  const pendientes = Number(s?.pendientes ?? 0);
  const totalN     = retiradas + pendientes;

  return NextResponse.json({
    periodo: { desde: desdeStr, hasta: hastaStr },
    totales: {
      total: totalN, retiradas, pendientes, verde, amarillo, rojo,
      efectividad: retiradas > 0 ? Math.round((verde / retiradas) * 1000) / 10 : 0,
      tasaRetiro:  totalN   > 0 ? Math.round((retiradas / totalN) * 1000) / 10 : 0,
      avgEsperaSeg: s?.avg_seg ? Math.round(Number(s.avg_seg)) : null,
    },
    porDia: diaRows.map(r => ({
      fecha:      r.fecha,
      total:      Number(r.retiradas) + Number(r.pendientes),
      retiradas:  Number(r.retiradas),
      pendientes: Number(r.pendientes),
      verde:      Number(r.verde),
      amarillo:   Number(r.amarillo),
      rojo:       Number(r.rojo),
      avgSeg:     r.avg_seg ? Math.round(Number(r.avg_seg)) : null,
    })),
    porLocal: localRows.map(r => {
      const ret = Number(r.retiradas);
      const v   = Number(r.verde);
      return {
        id: r.id, nombre: r.nombre,
        total:      ret + Number(r.pendientes),
        retiradas:  ret,
        verde: v, amarillo: Number(r.amarillo), rojo: Number(r.rojo),
        efectividad: ret > 0 ? Math.round((v / ret) * 1000) / 10 : 0,
        avgSeg: r.avg_seg ? Math.round(Number(r.avg_seg)) : null,
      };
    }),
  });
}
