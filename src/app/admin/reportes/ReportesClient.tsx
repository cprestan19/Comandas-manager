"use client";

import { useCallback, useEffect, useState } from "react";

// ── Types ───────────────────────────────────────────────────────────────────

interface LocalOpt { id: string; nombre: string }

interface Totales {
  total: number; retiradas: number; pendientes: number;
  verde: number; amarillo: number; rojo: number;
  efectividad: number; tasaRetiro: number;
  avgEsperaSeg: number | null;
}

interface DiaData {
  fecha: string; total: number; retiradas: number; pendientes: number;
  verde: number; amarillo: number; rojo: number; avgSeg: number | null;
}

interface LocalData {
  id: string; nombre: string; total: number; retiradas: number;
  verde: number; amarillo: number; rojo: number;
  efectividad: number; avgSeg: number | null;
}

interface ReporteData {
  periodo: { desde: string; hasta: string };
  totales: Totales;
  porDia:   DiaData[];
  porLocal: LocalData[];
}

interface Props { locales: LocalOpt[] }

// ── Helpers ─────────────────────────────────────────────────────────────────

const TZ = "America/Panama";

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

function monthStartStr(): string {
  const now = new Date();
  const y = now.toLocaleDateString("en-CA", { timeZone: TZ }).split("-")[0];
  const m = now.toLocaleDateString("en-CA", { timeZone: TZ }).split("-")[1];
  return `${y}-${m}-01`;
}

function fmtSeg(seg: number | null): string {
  if (seg === null || seg === 0) return "—";
  if (seg < 60) return `${seg}s`;
  const m = Math.floor(seg / 60), s = seg % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function fmtFecha(iso: string): string {
  return new Date(`${iso}T12:00:00-05:00`).toLocaleDateString("es-PA", {
    weekday: "short", day: "2-digit", month: "2-digit", timeZone: TZ,
  });
}

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function DonutChart({ verde, amarillo, rojo }: { verde: number; amarillo: number; rojo: number }) {
  const total = verde + amarillo + rojo;
  const vPct  = total > 0 ? (verde   / total) * 100 : 0;
  const aPct  = total > 0 ? (amarillo / total) * 100 : 0;

  if (total === 0) {
    return (
      <div className="relative w-40 h-40 mx-auto">
        <div className="w-full h-full rounded-full bg-gray-800" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[100px] h-[100px] bg-gray-950 rounded-full flex items-center justify-center">
            <span className="text-gray-600 text-xs text-center">Sin<br/>datos</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-40 h-40 mx-auto">
      <div
        className="w-full h-full rounded-full"
        style={{
          background: `conic-gradient(
            #22c55e 0% ${vPct}%,
            #eab308 ${vPct}% ${vPct + aPct}%,
            #ef4444 ${vPct + aPct}% 100%
          )`,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="bg-gray-950 rounded-full flex flex-col items-center justify-center"
          style={{ width: 100, height: 100 }}
        >
          <span className="text-3xl font-black text-white leading-none">{Math.round(vPct)}%</span>
          <span className="text-[10px] text-gray-500 mt-0.5">a tiempo</span>
        </div>
      </div>
    </div>
  );
}

function StackedBar({ verde, amarillo, rojo, pendientes }: { verde: number; amarillo: number; rojo: number; pendientes: number }) {
  const total = verde + amarillo + rojo + pendientes;
  if (total === 0) return <div className="h-3 bg-gray-800 rounded-full" />;
  return (
    <div className="h-3 rounded-full overflow-hidden flex gap-[1px] bg-gray-900">
      {verde    > 0 && <div style={{ width: pct(verde,    total) }} className="bg-green-500  h-full" title={`Verde: ${verde}`}    />}
      {amarillo > 0 && <div style={{ width: pct(amarillo, total) }} className="bg-yellow-400 h-full" title={`Amarillo: ${amarillo}`} />}
      {rojo     > 0 && <div style={{ width: pct(rojo,     total) }} className="bg-red-500    h-full" title={`Rojo: ${rojo}`}     />}
      {pendientes > 0 && <div style={{ width: pct(pendientes, total) }} className="bg-gray-700 h-full" title={`Pendientes: ${pendientes}`} />}
    </div>
  );
}

function Gauge({ valor, max, color }: { valor: number; max: number; color: string }) {
  const w = max > 0 ? `${Math.round((valor / max) * 100)}%` : "0%";
  return (
    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: w }} />
    </div>
  );
}

function GradeChip({ efectividad }: { efectividad: number }) {
  const { label, cls } = efectividad >= 90 ? { label: "Excelente 🏆", cls: "bg-green-900/40 text-green-400 border-green-800" }
    : efectividad >= 70                     ? { label: "Bueno ✅",     cls: "bg-yellow-900/30 text-yellow-400 border-yellow-800" }
    : efectividad >= 50                     ? { label: "Regular ⚠️",  cls: "bg-orange-900/30 text-orange-400 border-orange-800" }
    :                                         { label: "Crítico 🔴",   cls: "bg-red-900/30 text-red-400 border-red-800" };

  return (
    <span className={`inline-block border text-xs font-semibold px-3 py-1 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

// ── Presets ──────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "Hoy",      desde: () => todayStr(),      hasta: () => todayStr()      },
  { label: "7 días",   desde: () => daysAgoStr(6),   hasta: () => todayStr()      },
  { label: "30 días",  desde: () => daysAgoStr(29),  hasta: () => todayStr()      },
  { label: "Este mes", desde: () => monthStartStr(),  hasta: () => todayStr()      },
] as const;

// ── Main component ───────────────────────────────────────────────────────────

export default function ReportesClient({ locales }: Props) {
  const [preset,   setPreset]   = useState<number>(0); // index into PRESETS, -1 = custom
  const [desde,    setDesde]    = useState(todayStr());
  const [hasta,    setHasta]    = useState(todayStr());
  const [localId,  setLocalId]  = useState("");
  const [data,     setData]     = useState<ReporteData | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const fetchData = useCallback(async (d: string, h: string, lid: string) => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ desde: d, hasta: h });
      if (lid) qs.set("localId", lid);
      const res = await fetch(`/api/admin/reportes?${qs}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Error al cargar"); return; }
      setData(json);
    } catch { setError("Error de conexión"); }
    finally { setLoading(false); }
  }, []);

  // Load on mount and filter changes
  useEffect(() => {
    fetchData(desde, hasta, localId);
  }, [desde, hasta, localId, fetchData]);

  function applyPreset(idx: number) {
    const p = PRESETS[idx];
    const d = p.desde(), h = p.hasta();
    setPreset(idx); setDesde(d); setHasta(h);
  }

  function handleCustomDates(field: "desde" | "hasta", val: string) {
    setPreset(-1);
    if (field === "desde") setDesde(val);
    else setHasta(val);
  }

  const t = data?.totales;
  const maxDia = data ? Math.max(...data.porDia.map(d => d.total), 1) : 1;

  return (
    <div className="space-y-7 pb-8">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Análisis de Efectividad</h1>
          <p className="text-gray-500 text-sm mt-0.5">Distribución de urgencia de comandas retiradas</p>
        </div>
        <button
          onClick={() => fetchData(desde, hasta, localId)}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          {loading ? "Cargando…" : "↻ Actualizar"}
        </button>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-wrap gap-4 items-end">

        {/* Period presets */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider">Período</span>
          <div className="flex gap-1 flex-wrap">
            {PRESETS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => applyPreset(i)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  preset === i
                    ? "bg-orange-500 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom dates */}
        <div className="flex gap-2 items-end">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider">Desde</span>
            <input
              type="date"
              value={desde}
              onChange={e => handleCustomDates("desde", e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-xs px-2.5 py-1.5 rounded-lg outline-none focus:border-orange-500 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider">Hasta</span>
            <input
              type="date"
              value={hasta}
              onChange={e => handleCustomDates("hasta", e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-xs px-2.5 py-1.5 rounded-lg outline-none focus:border-orange-500 transition-colors"
            />
          </div>
        </div>

        {/* Local selector */}
        {locales.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider">Local</span>
            <select
              value={localId}
              onChange={e => setLocalId(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-xs px-2.5 py-1.5 rounded-lg outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">Todos los locales</option>
              {locales.map(l => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-950/40 border border-red-900/50 text-red-400 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* ── Content (skeleton while loading) ────────────────────────────── */}
      {loading && !data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-24 animate-pulse" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* ── KPI cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total comandas",  value: t!.total,                          color: "text-orange-400", sub: "en el período" },
              { label: "Tasa de retiro",  value: `${t!.tasaRetiro}%`,              color: "text-blue-400",   sub: `${t!.retiradas} retiradas` },
              { label: "Efectividad",     value: `${t!.efectividad}%`,             color: t!.efectividad >= 70 ? "text-green-400" : t!.efectividad >= 50 ? "text-yellow-400" : "text-red-400", sub: "% retiradas a tiempo" },
              { label: "Tiempo promedio", value: fmtSeg(t!.avgEsperaSeg),           color: "text-teal-400",   sub: "LISTA → RETIRADA" },
            ].map(m => (
              <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className={`text-3xl font-black tabular-nums leading-none ${m.color}`}>{m.value}</p>
                <p className="text-xs font-semibold text-gray-300 mt-2">{m.label}</p>
                <p className="text-[11px] text-gray-600 mt-0.5">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Donut + distribución ─────────────────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-4">

            {/* Donut + grade */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-bold text-white mb-5">Distribución de urgencia — retiradas</h2>
              <div className="flex items-center gap-6 flex-wrap">
                <DonutChart verde={t!.verde} amarillo={t!.amarillo} rojo={t!.rojo} />
                <div className="flex-1 space-y-4 min-w-[180px]">

                  {[
                    { label: "A tiempo",     count: t!.verde,    color: "bg-green-500",  text: "text-green-400"  },
                    { label: "Intermedio",   count: t!.amarillo, color: "bg-yellow-400", text: "text-yellow-400" },
                    { label: "Tardío",       count: t!.rojo,     color: "bg-red-500",    text: "text-red-400"    },
                    { label: "Pendientes",   count: t!.pendientes, color: "bg-gray-700", text: "text-gray-500"   },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-sm ${item.color} inline-block shrink-0`} />
                          <span className="text-gray-400">{item.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold tabular-nums ${item.text}`}>{item.count}</span>
                          <span className="text-gray-600 tabular-nums w-10 text-right">
                            {pct(item.count, t!.total)}
                          </span>
                        </div>
                      </div>
                      <Gauge valor={item.count} max={t!.total} color={item.color} />
                    </div>
                  ))}

                  <div className="pt-2 border-t border-gray-800">
                    <GradeChip efectividad={t!.efectividad} />
                  </div>
                </div>
              </div>
            </div>

            {/* Tendencia por día */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-sm font-bold text-white mb-4">Tendencia diaria</h2>
              {data.porDia.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-10">Sin datos en el período</p>
              ) : (
                <div className="space-y-3">
                  {data.porDia.map(d => (
                    <div key={d.fecha}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-400 w-24 shrink-0">{fmtFecha(d.fecha)}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-gray-500 tabular-nums">{d.retiradas}/{d.total}</span>
                          <span className="text-gray-600 tabular-nums w-10 text-right">{fmtSeg(d.avgSeg)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden flex">
                            {d.total > 0 && <>
                              <div style={{ width: pct(d.verde,     d.total) }} className="bg-green-500  h-full" />
                              <div style={{ width: pct(d.amarillo,  d.total) }} className="bg-yellow-400 h-full" />
                              <div style={{ width: pct(d.rojo,      d.total) }} className="bg-red-500    h-full" />
                              <div style={{ width: pct(d.pendientes, d.total) }} className="bg-gray-700  h-full" />
                            </>}
                          </div>
                        </div>
                        <span className="text-xs text-orange-300 font-bold tabular-nums w-5 text-right shrink-0">{d.total}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-800 text-[11px] text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500  inline-block" />A tiempo</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-400 inline-block" />Intermedio</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500    inline-block" />Tardío</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-700   inline-block" />Pendiente</span>
              </div>
            </div>
          </div>

          {/* ── Tabla por local ────────────────────────────────────────── */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Efectividad por local</h2>
              <span className="text-xs text-gray-600">{data.porLocal.length} local(es)</span>
            </div>
            {data.porLocal.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-8">Sin locales</p>
            ) : (
              <div className="divide-y divide-gray-800">
                {data.porLocal.map(local => (
                  <div key={local.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="text-white font-semibold">{local.nombre}</span>
                          <GradeChip efectividad={local.efectividad} />
                          <span className={`text-sm font-black tabular-nums ${
                            local.efectividad >= 70 ? "text-green-400" : local.efectividad >= 50 ? "text-yellow-400" : "text-red-400"
                          }`}>
                            {local.efectividad}%
                          </span>
                        </div>
                        <StackedBar
                          verde={local.verde} amarillo={local.amarillo}
                          rojo={local.rojo} pendientes={local.total - local.retiradas}
                        />
                        <div className="flex gap-3 mt-2 text-[11px]">
                          <span className="text-green-400">{local.verde} verde</span>
                          <span className="text-yellow-400">{local.amarillo} amarillo</span>
                          <span className="text-red-400">{local.rojo} rojo</span>
                          {(local.total - local.retiradas) > 0 && (
                            <span className="text-gray-600">{local.total - local.retiradas} pendientes</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-5 shrink-0">
                        {[
                          { label: "Total",     value: local.total,     color: "text-gray-300"  },
                          { label: "Retiradas", value: local.retiradas, color: "text-orange-400" },
                          { label: "Prom.",     value: fmtSeg(local.avgSeg), color: "text-teal-400" },
                        ].map(m => (
                          <div key={m.label} className="text-center">
                            <p className={`text-xl font-black tabular-nums ${m.color}`}>{m.value}</p>
                            <p className="text-[10px] text-gray-600">{m.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
