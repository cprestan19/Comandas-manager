import { getServerSession }  from "next-auth";
import { authOptions }        from "@/lib/auth";
import { Rol }                from "@/generated/prisma/enums";
import prisma                 from "@/lib/prisma";
import DashboardClient        from "./DashboardClient";

export const dynamic  = "force-dynamic";
export const metadata = { title: "Dashboard — Admin Comandas" };

const TZ = "America/Panama";

function startOfToday(): Date {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  return new Date(`${todayStr}T00:00:00-05:00`);
}

function startOfDaysAgo(days: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - days);
  return d;
}

function fmtFecha(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00-05:00`);
  return d.toLocaleDateString("es-PA", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: TZ });
}

export default async function AdminPage() {
  const session   = await getServerSession(authOptions);
  const rol       = session?.user.rol as Rol;
  const empresaId = session?.user.empresaId ?? null;

  const hoy    = startOfToday();
  const hace7  = startOfDaysAgo(7);
  const hace30 = startOfDaysAgo(30);

  // Obtener localIds de la empresa del usuario (si es ADMIN_LOCAL)
  let localIds: string[] = [];
  if (rol === Rol.ADMIN_LOCAL && empresaId) {
    const ls = await prisma.local.findMany({ where: { empresaId }, select: { id: true } });
    localIds = ls.map(l => l.id);
  }

  const localFilter = rol === Rol.ADMIN_LOCAL ? { localId: { in: localIds.length > 0 ? localIds : ["__none__"] } } : {};
  const localClause = localIds.length > 0
    ? `AND c.local_id IN (${localIds.map(id => `'${id}'`).join(",")})`
    : "";
  const empresaClause = rol === Rol.ADMIN_LOCAL && empresaId ? `AND l.empresa_id = '${empresaId}'` : "";

  // ── Totales ──────────────────────────────────────────────────────────────────
  const [totalLocales, totalUsuarios, totalComandas, comandasHoy, comandasSemana, comandasMes] = await Promise.all([
    rol === Rol.ADMIN_LOCAL && empresaId
      ? prisma.local.count({ where: { empresaId } })
      : prisma.local.count(),
    rol === Rol.ADMIN_LOCAL && empresaId
      ? prisma.usuario.count({ where: { empresaId } })
      : prisma.usuario.count(),
    prisma.comanda.count({ where: localFilter }),
    prisma.comanda.count({ where: { listaAt: { gte: hoy }, ...localFilter } }),
    prisma.comanda.count({ where: { listaAt: { gte: startOfDaysAgo(7) }, ...localFilter } }),
    prisma.comanda.count({ where: { listaAt: { gte: hace30 }, ...localFilter } }),
  ]);

  // ── Tiempo promedio ───────────────────────────────────────────────────────────
  type AvgRow = { avg_seg: number | null };
  const [avgRows, avgRowsTotal] = await Promise.all([
    prisma.$queryRawUnsafe<AvgRow[]>(`
      SELECT AVG(EXTRACT(EPOCH FROM (retirada_at - lista_at))) AS avg_seg
      FROM comandas c
      WHERE retirada_at IS NOT NULL AND lista_at >= $1 ${localClause}
    `, hoy),
    prisma.$queryRawUnsafe<AvgRow[]>(`
      SELECT AVG(EXTRACT(EPOCH FROM (retirada_at - lista_at))) AS avg_seg
      FROM comandas c
      WHERE retirada_at IS NOT NULL ${localClause}
    `),
  ]);

  const avgEsperaHoy   = avgRows[0]?.avg_seg     ? Math.round(Number(avgRows[0].avg_seg))     : null;
  const avgEsperaTotal = avgRowsTotal[0]?.avg_seg ? Math.round(Number(avgRowsTotal[0].avg_seg)) : null;

  // ── Urgencia hoy ─────────────────────────────────────────────────────────────
  type UrgRow = { verde: bigint; amarillo: bigint; rojo: bigint };
  const urgRows = await prisma.$queryRawUnsafe<UrgRow[]>(`
    SELECT
      COUNT(c.id) FILTER (
        WHERE c.retirada_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (c.retirada_at - c.lista_at))/60 < l."umbralAmarilloMin"
      )::bigint AS verde,
      COUNT(c.id) FILTER (
        WHERE c.retirada_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (c.retirada_at - c.lista_at))/60 >= l."umbralAmarilloMin"
          AND EXTRACT(EPOCH FROM (c.retirada_at - c.lista_at))/60 < l."umbralRojoMin"
      )::bigint AS amarillo,
      COUNT(c.id) FILTER (
        WHERE c.retirada_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (c.retirada_at - c.lista_at))/60 >= l."umbralRojoMin"
      )::bigint AS rojo
    FROM comandas c JOIN locales l ON c.local_id = l.id
    WHERE c.estado = 'RETIRADA' AND c.lista_at >= $1 ${localClause}
  `, hoy);

  const urgenciaHoy = {
    verde:    Number(urgRows[0]?.verde    ?? 0),
    amarillo: Number(urgRows[0]?.amarillo ?? 0),
    rojo:     Number(urgRows[0]?.rojo     ?? 0),
  };

  // ── Por día ───────────────────────────────────────────────────────────────────
  type DiaRow = { fecha: string; total: bigint; retiradas: bigint; avg_seg: number | null };
  const porDia = await prisma.$queryRawUnsafe<DiaRow[]>(`
    SELECT
      TO_CHAR(c.lista_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Panama', 'YYYY-MM-DD') AS fecha,
      COUNT(*)::bigint AS total,
      COUNT(CASE WHEN c.estado = 'RETIRADA' THEN 1 END)::bigint AS retiradas,
      AVG(CASE WHEN c.retirada_at IS NOT NULL THEN EXTRACT(EPOCH FROM (c.retirada_at - c.lista_at)) END) AS avg_seg
    FROM comandas c
    WHERE c.lista_at >= $1 ${localClause}
    GROUP BY 1 ORDER BY 1 DESC
  `, hace7);

  // ── Por hora ─────────────────────────────────────────────────────────────────
  type HoraRow = { hora: number; total: bigint };
  const porHora = await prisma.$queryRawUnsafe<HoraRow[]>(`
    SELECT
      EXTRACT(HOUR FROM lista_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Panama')::int AS hora,
      COUNT(*)::bigint AS total
    FROM comandas c
    WHERE c.lista_at >= $1 ${localClause}
    GROUP BY 1 ORDER BY 1
  `, hoy);

  // ── Por local ─────────────────────────────────────────────────────────────────
  type LocalRow = { id: string; nombre: string; descripcion: string | null; slug: string; displayToken: string; empresaNombre: string | null; total: bigint; hoy: bigint; activas: bigint; avg_seg: number | null };
  const porLocal = await prisma.$queryRawUnsafe<LocalRow[]>(`
    SELECT
      l.id, l.nombre, l.descripcion, l.slug, l."displayToken",
      e.nombre AS "empresaNombre",
      COUNT(c.id)::bigint AS total,
      COUNT(CASE WHEN c.lista_at >= $1 THEN 1 END)::bigint AS hoy,
      COUNT(CASE WHEN c.estado = 'LISTA' THEN 1 END)::bigint AS activas,
      AVG(CASE WHEN c.retirada_at IS NOT NULL THEN EXTRACT(EPOCH FROM (c.retirada_at - c.lista_at)) END) AS avg_seg
    FROM locales l
    LEFT JOIN empresas e ON l.empresa_id = e.id
    LEFT JOIN comandas c ON c.local_id = l.id
    WHERE 1=1 ${empresaClause}
    GROUP BY l.id, l.nombre, l.descripcion, l.slug, l."displayToken", e.nombre
    ORDER BY l.nombre
  `, hoy);

  // ── Últimos logins (solo SUPERADMIN ve todos, ADMIN_LOCAL ve los suyos) ───────
  type LoginRow = { email: string; ip: string; exitoso: boolean; createdAt: Date; userName: string | null };
  const loginLogs = await prisma.$queryRawUnsafe<LoginRow[]>(`
    SELECT ll.email, ll.ip, ll.exitoso, ll."createdAt", u.nombre AS "userName"
    FROM login_logs ll
    LEFT JOIN usuarios u ON ll.usuario_id = u.id
    WHERE 1=1 ${rol === Rol.ADMIN_LOCAL && empresaId ? `AND (u.empresa_id = '${empresaId}' OR u.empresa_id IS NULL AND ll.exitoso = false)` : ""}
    ORDER BY ll."createdAt" DESC
    LIMIT 10
  `);

  const diasData = porDia.map(r => ({
    fecha:    fmtFecha(r.fecha),
    fechaRaw: r.fecha,
    total:    Number(r.total),
    retiradas: Number(r.retiradas),
    avgSeg:   r.avg_seg ? Math.round(Number(r.avg_seg)) : null,
  }));

  const horasData = Array.from({ length: 24 }, (_, h) => {
    const row = porHora.find(r => Number(r.hora) === h);
    return { hora: h, total: row ? Number(row.total) : 0 };
  });

  const localesData = porLocal.map(r => ({
    id:           r.id,
    nombre:       r.nombre,
    descripcion:  r.descripcion,
    slug:         r.slug,
    displayToken: r.displayToken,
    empresaNombre: r.empresaNombre,
    total:        Number(r.total),
    hoy:          Number(r.hoy),
    activas:      Number(r.activas),
    avgSeg:       r.avg_seg ? Math.round(Number(r.avg_seg)) : null,
  }));

  const loginData = loginLogs.map(r => ({
    email:     r.email,
    ip:        r.ip,
    exitoso:   r.exitoso,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    userName:  r.userName,
  }));

  return (
    <DashboardClient
      userName={session?.user.nombre ?? ""}
      metricas={{ totalLocales, totalUsuarios, totalComandas, comandasHoy, comandasSemana, comandasMes, avgEsperaHoy, avgEsperaTotal }}
      urgenciaHoy={urgenciaHoy}
      diasData={diasData}
      horasData={horasData}
      localesData={localesData}
      loginData={loginData}
    />
  );
}
