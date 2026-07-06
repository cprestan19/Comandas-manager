"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Pusher, { Channel } from "pusher-js";

interface Comanda {
  id:      string;
  numero:  string;
  listaAt: string; // ISO string
}

interface Props {
  localNombre:           string;
  displayToken:          string;
  umbralAmarilloMin:     number;
  umbralRojoMin:         number;
  tiempoDesaparicionMin: number; // 0 = nunca
  soloDisplay:           boolean; // true = sin interacción (TV pública)
  comandasIniciales:     Comanda[];
}

type ConexionEstado = "conectando" | "conectado" | "desconectado";

function beep() {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* no disponible en SSR */ }
}

function minutosTranscurridos(listaAt: string): number {
  return (Date.now() - new Date(listaAt).getTime()) / 1000 / 60;
}

function colorClase(min: number, umbA: number, umbR: number): string {
  if (min >= umbR) return "border-red-600    bg-red-500    text-white";
  if (min >= umbA) return "border-yellow-500 bg-yellow-400 text-white";
  return                  "border-green-600  bg-green-500  text-white";
}

function etiqueta(min: number, umbA: number, umbR: number): string {
  if (min >= umbR) return "URGENTE";
  if (min >= umbA) return "EN ESPERA";
  return                  "RECIÉN";
}

function formatMinutos(minutos: number): string {
  const m = Math.floor(minutos);
  const s = Math.floor((minutos - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function DisplayClient({
  localNombre,
  displayToken,
  umbralAmarilloMin,
  umbralRojoMin,
  tiempoDesaparicionMin,
  soloDisplay,
  comandasIniciales,
}: Props) {
  const [comandas,  setComandas]  = useState<Comanda[]>(comandasIniciales);
  const [tick,      setTick]      = useState(0);
  const [conexion,  setConexion]  = useState<ConexionEstado>("conectando");
  const [retirando, setRetirando] = useState<string | null>(null);
  const pusherRef   = useRef<Pusher | null>(null);
  const channelRef  = useRef<Channel | null>(null);
  // Map comanda.id → timeout ID para auto-desaparición
  const timersRef   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Auto-desaparición ─────────────────────────────────────────────────────
  const programarDesaparicion = useCallback((id: string, listaAt: string) => {
    if (tiempoDesaparicionMin === 0) return;

    const elapsedMs   = Date.now() - new Date(listaAt).getTime();
    const totalMs     = tiempoDesaparicionMin * 60 * 1000;
    const restanteMs  = totalMs - elapsedMs;

    // Limpiar timer previo si existía
    const prev = timersRef.current.get(id);
    if (prev) clearTimeout(prev);

    if (restanteMs <= 0) {
      // Ya expiró — quitar inmediatamente
      setComandas(prev => prev.filter(c => c.id !== id));
      return;
    }

    const tid = setTimeout(() => {
      setComandas(prev => prev.filter(c => c.id !== id));
      timersRef.current.delete(id);
    }, restanteMs);

    timersRef.current.set(id, tid);
  }, [tiempoDesaparicionMin]);

  // Programar timers para las comandas iniciales al montar
  useEffect(() => {
    if (tiempoDesaparicionMin === 0) return;
    comandasIniciales.forEach(c => programarDesaparicion(c.id, c.listaAt));
    return () => {
      timersRef.current.forEach(tid => clearTimeout(tid));
      timersRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick cada segundo para actualizar timers visuales
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Pusher ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster:           process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      enabledTransports: ["ws", "wss"],
    });
    pusherRef.current = pusher;

    pusher.connection.bind("connecting",   () => setConexion("conectando"));
    pusher.connection.bind("connected",    () => setConexion("conectado"));
    pusher.connection.bind("disconnected", () => setConexion("desconectado"));
    pusher.connection.bind("failed",       () => setConexion("desconectado"));

    const channel = pusher.subscribe(`display-${displayToken}`);
    channelRef.current = channel;

    channel.bind("comanda.nueva", (data: { id: string; numero: string; listaAt: string }) => {
      setComandas(prev => {
        if (prev.some(c => c.id === data.id)) return prev;
        beep();
        programarDesaparicion(data.id, data.listaAt);
        return [...prev, data].sort(
          (a, b) => new Date(a.listaAt).getTime() - new Date(b.listaAt).getTime(),
        );
      });
    });

    channel.bind("comanda.retirada", (data: { id: string }) => {
      setComandas(prev => prev.filter(c => c.id !== data.id));
      // Cancelar el timer si existía
      const tid = timersRef.current.get(data.id);
      if (tid) { clearTimeout(tid); timersRef.current.delete(data.id); }
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`display-${displayToken}`);
      pusher.disconnect();
    };
  }, [displayToken, programarDesaparicion]);

  const retirarComanda = useCallback(async (comanda: Comanda) => {
    if (retirando) return;
    setRetirando(comanda.id);
    try {
      const res = await fetch(`/api/comandas/${comanda.id}/retirar`, {
        method:  "PATCH",
        headers: { "x-display-token": displayToken },
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "No se pudo retirar");
      }
    } catch {
      alert("Sin conexión — reintenta");
    } finally {
      setRetirando(null);
    }
  }, [displayToken, retirando]);

  // Ordenar: más urgentes (más tiempo esperando) primero
  const ordenadas = [...comandas]
    .map(c => ({ ...c, minutos: minutosTranscurridos(c.listaAt) }))
    .sort((a, b) => b.minutos - a.minutos);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col select-none">

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🍽️</span>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">{localNombre}</h1>
            <p className="text-gray-500 text-xs">
              {soloDisplay ? "Pantalla de visualización" : "Comandas listas para retirar"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${
            conexion === "conectado"  ? "bg-green-400 animate-pulse" :
            conexion === "conectando" ? "bg-yellow-400 animate-pulse" :
                                        "bg-red-500"
          }`} />
          <span className="text-xs text-gray-500">
            {conexion === "conectado"  ? "En vivo" :
             conexion === "conectando" ? "Conectando…" :
                                         "Sin conexión"}
          </span>
        </div>
      </header>

      {/* Grid de comandas */}
      <main className="flex-1 p-4 overflow-y-auto">
        {ordenadas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-64 text-gray-700">
            <span className="text-7xl mb-4 opacity-30">✓</span>
            <p className="text-xl font-semibold">Sin comandas pendientes</p>
            <p className="text-sm mt-1">Las nuevas aparecerán aquí al instante</p>
          </div>
        ) : (
          <div
            className="grid gap-6"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))" }}
          >
            {ordenadas.map(c => {
              const color      = colorClase(c.minutos, umbralAmarilloMin, umbralRojoMin);
              const etiq       = etiqueta(c.minutos, umbralAmarilloMin, umbralRojoMin);
              const esRetirando = retirando === c.id;

              const tieneAutoOcultar = tiempoDesaparicionMin > 0;
              const minutosRestantes = tiempoDesaparicionMin - c.minutos;
              const progresoPct = tieneAutoOcultar
                ? Math.max(0, Math.min(100, (minutosRestantes / tiempoDesaparicionMin) * 100))
                : 100;
              const porDesaparecer = tieneAutoOcultar && minutosRestantes < 0.5;
              const muyPoco        = tieneAutoOcultar && minutosRestantes < 0.25;

              const numSize =
                c.numero.length <= 3 ? "text-9xl" :
                c.numero.length <= 5 ? "text-8xl" :
                c.numero.length <= 7 ? "text-7xl" :
                                       "text-6xl";

              const esRojo = c.minutos >= umbralRojoMin;

              const contenidoTarjeta = (
                <>
                  {/* Número */}
                  <span className={`${numSize} font-black leading-tight tracking-tight mb-3 w-full text-center break-all px-1 text-black`}>
                    {c.numero}
                  </span>

                  {/* Timer de espera */}
                  <span className="text-4xl font-bold tabular-nums text-black/80 mt-2">
                    {formatMinutos(c.minutos)}
                  </span>

                  {/* Etiqueta de urgencia */}
                  <span className="text-base font-semibold mt-3 text-black/60 uppercase tracking-widest">
                    {etiq}
                  </span>

                  {/* Barra de progreso de auto-desaparición */}
                  {tieneAutoOcultar && (
                    <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/20">
                      <div
                        className={`h-full transition-all duration-1000 ease-linear bg-white/60 ${porDesaparecer ? "animate-pulse" : ""}`}
                        style={{ width: `${progresoPct}%` }}
                      />
                    </div>
                  )}

                  {/* Tiempo restante para desaparecer */}
                  {tieneAutoOcultar && minutosRestantes > 0 && (
                    <span className={`absolute top-2 right-2.5 text-[10px] font-mono text-white/60 ${porDesaparecer ? "text-white animate-pulse" : ""}`}>
                      -{formatMinutos(minutosRestantes)}
                    </span>
                  )}

                  {/* Overlay retirando (solo modo interactivo) */}
                  {!soloDisplay && esRetirando && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl">
                      <span className="text-black font-bold text-sm">Retirando…</span>
                    </div>
                  )}

                  {/* Hint táctil (solo modo interactivo) */}
                  {!soloDisplay && !tieneAutoOcultar && (
                    <span className="absolute bottom-2 right-3 text-[10px] text-black/40">
                      TAP para retirar
                    </span>
                  )}
                </>
              );

              const claseBase = `
                relative flex flex-col items-center justify-center
                rounded-3xl border-4 p-8 min-h-[320px] overflow-hidden
                transition-all duration-150
                ${color}
                ${esRojo ? "parpadeo-urgente" : ""}
                ${muyPoco ? "opacity-40" : porDesaparecer ? "opacity-70" : ""}
              `;

              if (soloDisplay) {
                return (
                  <div key={c.id} className={claseBase}>
                    {contenidoTarjeta}
                  </div>
                );
              }

              return (
                <button
                  key={c.id}
                  onClick={() => retirarComanda(c)}
                  disabled={esRetirando}
                  className={`${claseBase} cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {contenidoTarjeta}
                </button>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="px-4 py-2 border-t border-gray-800 bg-gray-900 flex items-center justify-between">
        <span className="text-xs text-gray-600">
          {ordenadas.length} comanda{ordenadas.length !== 1 ? "s" : ""} pendiente{ordenadas.length !== 1 ? "s" : ""}
          {tiempoDesaparicionMin > 0 && (
            <span className="ml-2 text-gray-700">· Auto-ocultar: {tiempoDesaparicionMin} min</span>
          )}
        </span>
        <span className="text-xs text-gray-700">
          {new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </footer>

      {/* Invisible: tick fuerza re-render para timers */}
      <span className="hidden">{tick}</span>
    </div>
  );
}
