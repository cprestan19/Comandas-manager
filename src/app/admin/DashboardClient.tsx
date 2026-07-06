"use client";

import { useState } from "react";

interface Metricas {
  totalLocales:    number;
  totalUsuarios:   number;
  totalComandas:   number;
  comandasHoy:     number;
  comandasSemana:  number;
  comandasMes:     number;
  avgEsperaHoy:    number | null;
  avgEsperaTotal:  number | null;
}

interface UrgenciaHoy {
  verde:    number;
  amarillo: number;
  rojo:     number;
}

interface DiaData {
  fecha:    string;
  fechaRaw: string;
  total:    number;
  retiradas: number;
  avgSeg:   number | null;
}

interface HoraData {
  hora:  number;
  total: number;
}

interface LocalData {
  id:            string;
  nombre:        string;
  descripcion:   string | null;
  slug:          string;
  displayToken:  string;
  empresaNombre: string | null;
  total:         number;
  hoy:           number;
  activas:       number;
  avgSeg:        number | null;
}

interface LoginEntry {
  email:     string;
  ip:        string;
  exitoso:   boolean;
  createdAt: string;
  userName:  string | null;
}

interface Props {
  userName:    string;
  metricas:    Metricas;
  urgenciaHoy: UrgenciaHoy;
  diasData:    DiaData[];
  horasData:   HoraData[];
  localesData: LocalData[];
  loginData:   LoginEntry[];
}

function fmtSeg(seg: number | null): string {
  if (seg === null) return "—";
  if (seg < 60) return `${seg}s`;
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function fmtHora(h: number): string {
  const suffix = h < 12 ? "am" : "pm";
  const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}${suffix}`;
}

// Barra horizontal proporcional
function Barra({ valor, max, color }: { valor: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return (
    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function DashboardClient({ userName, metricas, urgenciaHoy, diasData, horasData, localesData, loginData }: Props) {
  const [copiadoToken, setCopiadoToken] = useState<string | null>(null);

  const maxDia  = Math.max(...diasData.map(d => d.total), 1);
  const maxHora = Math.max(...horasData.map(h => h.total), 1);

  // Horas con actividad (para mostrar solo el rango relevante)
  const horasConActividad = horasData.filter(h => h.total > 0);
  const horaMin = horasConActividad.length ? Math.max(0, horasConActividad[0].hora - 1) : 6;
  const horaMax = horasConActividad.length ? Math.min(23, horasConActividad[horasConActividad.length - 1].hora + 1) : 22;
  const horasRango = horasData.slice(horaMin, horaMax + 1);

  function copiarDisplayUrl(token: string) {
    const url = `${window.location.origin}/display/${token}`;
    navigator.clipboard.writeText(url);
    setCopiadoToken(token);
    setTimeout(() => setCopiadoToken(null), 2000);
  }

  return (
    <div className="space-y-7">
      {/* Saludo */}
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Bienvenido, {userName}</p>
      </div>

      {/* ── Métricas superiores ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Comandas hoy",     value: metricas.comandasHoy,    color: "text-orange-400", sub: "desde medianoche" },
          { label: "Esta semana",      value: metricas.comandasSemana,  color: "text-yellow-400", sub: "últimos 7 días"   },
          { label: "Este mes",         value: metricas.comandasMes,     color: "text-blue-400",   sub: "últimos 30 días"  },
          { label: "Total acumulado",  value: metricas.totalComandas,   color: "text-gray-400",   sub: "todas las fechas" },
        ].map(m => (
          <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className={`text-3xl font-black tabular-nums ${m.color}`}>{m.value}</p>
            <p className="text-xs font-semibold text-gray-300 mt-1">{m.label}</p>
            <p className="text-[11px] text-gray-600">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Tiempos de espera ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Espera prom. hoy",   value: fmtSeg(metricas.avgEsperaHoy),   color: "text-green-400",  desc: "LISTA → RETIRADA hoy" },
          { label: "Espera prom. total", value: fmtSeg(metricas.avgEsperaTotal),  color: "text-teal-400",   desc: "histórico general"     },
          { label: "Locales activos",    value: metricas.totalLocales,            color: "text-orange-400", desc: "locales registrados"   },
          { label: "Usuarios",           value: metricas.totalUsuarios,           color: "text-purple-400", desc: "cocina + admin"        },
        ].map(m => (
          <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className={`text-2xl font-black tabular-nums ${m.color}`}>{m.value}</p>
            <p className="text-xs font-semibold text-gray-300 mt-1">{m.label}</p>
            <p className="text-[11px] text-gray-600">{m.desc}</p>
          </div>
        ))}
      </div>

      {/* ── Urgencia de retiradas — hoy ─────────────────────────────────── */}
      {(() => {
        const { verde, amarillo, rojo } = urgenciaHoy;
        const total = verde + amarillo + rojo;
        const pct   = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";
        return (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-white">Urgencia de retiradas — hoy</h2>
                <p className="text-[11px] text-gray-600 mt-0.5">{total} comanda(s) retirada(s) desde medianoche</p>
              </div>
              <a
                href="/admin/reportes"
                className="text-xs text-orange-400 hover:text-orange-300 border border-orange-900/40 hover:border-orange-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                Ver análisis completo →
              </a>
            </div>
            {total === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">Sin retiradas hoy</p>
            ) : (
              <>
                {/* Barra proporcional */}
                <div className="h-5 rounded-lg overflow-hidden flex gap-[2px] bg-gray-950 mb-4">
                  {verde    > 0 && <div style={{ width: pct(verde)    }} className="bg-green-500  h-full" />}
                  {amarillo > 0 && <div style={{ width: pct(amarillo) }} className="bg-yellow-400 h-full" />}
                  {rojo     > 0 && <div style={{ width: pct(rojo)     }} className="bg-red-500    h-full" />}
                </div>
                {/* Cards */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "A tiempo",   icon: "🟢", count: verde,    color: "text-green-400",  border: "border-green-900/40",  bg: "bg-green-950/20"  },
                    { label: "Intermedio", icon: "🟡", count: amarillo, color: "text-yellow-400", border: "border-yellow-900/40", bg: "bg-yellow-950/20" },
                    { label: "Tardío",     icon: "🔴", count: rojo,     color: "text-red-400",    border: "border-red-900/40",    bg: "bg-red-950/20"    },
                  ].map(s => (
                    <div key={s.label} className={`border rounded-xl p-3 text-center ${s.border} ${s.bg}`}>
                      <p className={`text-3xl font-black tabular-nums ${s.color}`}>{s.count}</p>
                      <p className="text-xs text-gray-400 mt-1">{s.icon} {s.label}</p>
                      <p className="text-[11px] text-gray-600">{pct(s.count)}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Análisis por fecha y hora ────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Comandas por día — últimos 7 días */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4">Comandas por día — últimos 7 días</h2>
          {diasData.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">Sin datos en este período</p>
          ) : (
            <div className="space-y-2.5">
              {diasData.map(d => (
                <div key={d.fechaRaw} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400 w-24 shrink-0">{d.fecha}</span>
                    <div className="flex-1 mx-3">
                      <Barra valor={d.total} max={maxDia} color="bg-orange-500" />
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-orange-300 font-bold tabular-nums w-6 text-right">{d.total}</span>
                      <span className="text-gray-600 tabular-nums w-14 text-right">⏱ {fmtSeg(d.avgSeg)}</span>
                    </div>
                  </div>
                  {/* sub-barra de retiradas */}
                  <div className="flex items-center gap-2 pl-24">
                    <div className="flex-1">
                      <Barra valor={d.retiradas} max={maxDia} color="bg-green-600/60" />
                    </div>
                    <span className="text-[10px] text-gray-600 w-[80px] text-right tabular-nums shrink-0">
                      {d.retiradas} retiradas
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-4 mt-4 pt-3 border-t border-gray-800 text-[11px] text-gray-600">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" />Total enviadas</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-600/60 inline-block" />Retiradas</span>
            <span className="ml-auto">⏱ Tiempo prom. espera</span>
          </div>
        </div>

        {/* Comandas por hora — hoy */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-4">Distribución por hora — hoy</h2>
          {horasConActividad.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">Sin comandas hoy todavía</p>
          ) : (
            <div className="space-y-1.5">
              {horasRango.map(h => (
                <div key={h.hora} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 tabular-nums w-10 shrink-0 text-right">{fmtHora(h.hora)}</span>
                  <Barra valor={h.total} max={maxHora} color={h.total === maxHora && h.total > 0 ? "bg-yellow-400" : "bg-orange-500/70"} />
                  <span className={`tabular-nums w-5 text-right font-bold ${h.total > 0 ? "text-orange-300" : "text-gray-700"}`}>
                    {h.total > 0 ? h.total : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
          {horasConActividad.length > 0 && (
            <p className="text-[11px] text-gray-600 mt-3 pt-3 border-t border-gray-800">
              🏆 Hora pico: {fmtHora(horasData.reduce((a, b) => a.total >= b.total ? a : b).hora)} — {horasData.reduce((a, b) => a.total >= b.total ? a : b).total} comandas
            </p>
          )}
        </div>
      </div>

      {/* ── Por local ────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-bold text-white">Resumen por local</h2>
        </div>

        {localesData.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-8">Sin locales registrados</p>
        ) : (
          <div className="divide-y divide-gray-800">
            {localesData.map(local => (
              <div key={local.id} className="px-5 py-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">

                  {/* Info del local */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold">{local.nombre}</span>
                      <span className="text-xs font-mono text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">/{local.slug}</span>
                      {local.empresaNombre && (
                        <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded-full">{local.empresaNombre}</span>
                      )}
                    </div>
                    {local.descripcion && (
                      <p className="text-gray-500 text-xs mt-1">{local.descripcion}</p>
                    )}

                    {/* URL del display */}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-gray-600 font-mono">
                        /display/{local.displayToken.slice(0, 12)}…
                      </span>
                      <button
                        onClick={() => copiarDisplayUrl(local.displayToken)}
                        className="text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
                      >
                        {copiadoToken === local.displayToken ? "✓ Copiado" : "📋 Copiar URL Monitor"}
                      </button>
                      <a
                        href={`/display/${local.displayToken}`}
                        target="_blank"
                        className="text-[11px] text-gray-500 hover:text-white transition-colors"
                      >
                        Abrir display ↗
                      </a>
                    </div>
                  </div>

                  {/* Métricas del local */}
                  <div className="flex gap-4 sm:gap-6 shrink-0">
                    {[
                      { label: "Hoy",      value: local.hoy,     color: "text-orange-400" },
                      { label: "Total",     value: local.total,   color: "text-gray-300"   },
                      { label: "Activas",   value: local.activas, color: local.activas > 0 ? "text-yellow-400" : "text-gray-600" },
                    ].map(m => (
                      <div key={m.label} className="text-center">
                        <p className={`text-xl font-black tabular-nums ${m.color}`}>{m.value}</p>
                        <p className="text-[10px] text-gray-600">{m.label}</p>
                      </div>
                    ))}
                    <div className="text-center">
                      <p className="text-xl font-black tabular-nums text-teal-400">{fmtSeg(local.avgSeg)}</p>
                      <p className="text-[10px] text-gray-600">Prom. espera</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Actividad de logins reciente ─────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Accesos recientes</h2>
          <a href="/api/admin/login-logs" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Ver todos →</a>
        </div>
        {loginData.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-6">Sin registros de acceso</p>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {loginData.map((log, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-4 text-xs">
                <span className={`w-2 h-2 rounded-full shrink-0 ${log.exitoso ? "bg-green-500" : "bg-red-500"}`} />
                <span className="text-gray-400 font-mono truncate min-w-0 flex-1">{log.email}</span>
                {log.userName && <span className="text-gray-600 hidden sm:block shrink-0">{log.userName}</span>}
                <span className="text-gray-600 font-mono shrink-0">{log.ip}</span>
                <span className="text-gray-700 shrink-0 hidden md:block">
                  {new Date(log.createdAt).toLocaleString("es-PA", { timeZone: "America/Panama", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
