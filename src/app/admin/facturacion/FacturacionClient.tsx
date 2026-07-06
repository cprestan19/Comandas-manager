"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Pago {
  id:         string;
  monto:      number;
  fecha:      string | Date;
  referencia: string | null;
  notas:      string | null;
}

interface Suscripcion {
  id:               string;
  estado:           string;
  montoMensual:     number;
  fechaInicio:      string | Date;
  fechaVencimiento: string | Date;
  notas:            string | null;
  pagos:            Pago[];
}

interface Local { id: string; nombre: string }

interface Empresa {
  id:          string;
  nombre:      string;
  activo:      boolean;
  _count:      { locales: number };
  locales:     Local[];
  suscripcion: Suscripcion | null;
  totalPagado: number;
}

interface Props { empresasIniciales: Empresa[] }

const ESTADOS = ["ACTIVA", "VENCIDA", "SUSPENDIDA", "CANCELADA"];

const estadoColor: Record<string, string> = {
  ACTIVA:    "bg-green-900/40 text-green-400",
  VENCIDA:   "bg-red-900/40 text-red-400",
  SUSPENDIDA:"bg-orange-900/40 text-orange-400",
  CANCELADA: "bg-gray-900/60 text-gray-500",
};

function fmt(d: string | Date) {
  return new Date(d).toLocaleDateString("es-PA", { day: "2-digit", month: "short", year: "numeric" });
}

function diasHasta(d: string | Date) {
  const dias = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  return dias;
}

export default function FacturacionClient({ empresasIniciales }: Props) {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<Empresa[]>(empresasIniciales);
  const [expand,   setExpand]   = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Modal suscripción
  const [suscModal, setSuscModal] = useState<string | null>(null); // empresaId
  const [suscForm,  setSuscForm]  = useState({
    estado: "ACTIVA", montoMensual: "", fechaInicio: "", fechaVencimiento: "", notas: "",
  });

  // Modal pago
  const [pagoModal, setPagoModal] = useState<string | null>(null); // suscripcionId
  const [pagoForm,  setPagoForm]  = useState({ monto: "", fecha: "", referencia: "", notas: "" });

  function abrirSusc(e: Empresa) {
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
    setSuscForm({
      estado:           e.suscripcion?.estado           ?? "ACTIVA",
      montoMensual:     e.suscripcion?.montoMensual.toString() ?? "",
      fechaInicio:      e.suscripcion?.fechaInicio ? new Date(e.suscripcion.fechaInicio).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) : hoy,
      fechaVencimiento: e.suscripcion?.fechaVencimiento ? new Date(e.suscripcion.fechaVencimiento).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) : hoy,
      notas:            e.suscripcion?.notas ?? "",
    });
    setSuscModal(e.id);
    setError(null);
  }

  function abrirPago(suscripcionId: string) {
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
    setPagoForm({ monto: "", fecha: hoy, referencia: "", notas: "" });
    setPagoModal(suscripcionId);
    setError(null);
  }

  async function guardarSusc() {
    if (!suscModal) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/admin/facturacion", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId: suscModal, ...suscForm, montoMensual: Number(suscForm.montoMensual) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSuscModal(null);
      router.refresh();
    } catch { setError("Error de conexión"); }
    finally { setSaving(false); }
  }

  async function guardarPago() {
    if (!pagoModal) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/admin/facturacion/pagos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suscripcionId: pagoModal, ...pagoForm, monto: Number(pagoForm.monto) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      // Actualizar localmente
      setEmpresas(prev => prev.map(e => {
        if (!e.suscripcion || e.suscripcion.id !== pagoModal) return e;
        return { ...e, suscripcion: { ...e.suscripcion, pagos: [data.pago, ...e.suscripcion.pagos] },
                 totalPagado: e.totalPagado + data.pago.monto };
      }));
      setPagoModal(null);
    } catch { setError("Error de conexión"); }
    finally { setSaving(false); }
  }

  async function eliminarPago(pagoId: string, suscId: string, monto: number) {
    if (!confirm("¿Eliminar este pago?")) return;
    const res = await fetch(`/api/admin/facturacion/pagos?id=${pagoId}`, { method: "DELETE" });
    if (!res.ok) { alert("Error al eliminar"); return; }
    setEmpresas(prev => prev.map(e => {
      if (!e.suscripcion || e.suscripcion.id !== suscId) return e;
      return { ...e, suscripcion: { ...e.suscripcion, pagos: e.suscripcion.pagos.filter(p => p.id !== pagoId) },
               totalPagado: e.totalPagado - monto };
    }));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Facturación</h1>
        <p className="text-gray-500 text-sm mt-0.5">Suscripciones y pagos por restaurante</p>
      </div>

      <div className="space-y-4">
        {empresas.map(e => {
          const susc = e.suscripcion;
          const dias = susc ? diasHasta(susc.fechaVencimiento) : null;
          const isExpanded = expand === e.id;

          return (
            <div key={e.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-white font-semibold">{e.nombre}</h2>
                      <span className="text-xs text-gray-600">{e._count.locales} sucursal(es)</span>
                    </div>

                    {/* Sucursales */}
                    {e.locales.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {e.locales.map(l => (
                          <span key={l.id} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                            {l.nombre}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Suscripción resumen */}
                    {susc ? (
                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${estadoColor[susc.estado] ?? "text-gray-500"}`}>
                          {susc.estado}
                        </span>
                        <span className="text-sm text-gray-300">
                          ${susc.montoMensual.toFixed(2)}/mes
                        </span>
                        <span className={`text-xs ${dias !== null && dias < 7 ? "text-yellow-400" : "text-gray-500"}`}>
                          Vence {fmt(susc.fechaVencimiento)}
                          {dias !== null && (dias >= 0 ? ` (${dias}d)` : ` (vencida ${Math.abs(dias)}d)`)}
                        </span>
                        <span className="text-xs text-green-400">
                          Total pagado: ${e.totalPagado.toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-600 mt-2 italic">Sin suscripción activa</p>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0 flex-col">
                    <button onClick={() => abrirSusc(e)}
                      className="text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30 px-3 py-1.5 rounded-lg transition-colors">
                      {susc ? "Editar suscripción" : "Crear suscripción"}
                    </button>
                    {susc && (
                      <>
                        <button onClick={() => abrirPago(susc.id)}
                          className="text-xs bg-green-900/20 hover:bg-green-900/40 text-green-400 border border-green-900/40 px-3 py-1.5 rounded-lg transition-colors">
                          + Registrar pago
                        </button>
                        <button onClick={() => setExpand(isExpanded ? null : e.id)}
                          className="text-xs text-gray-500 hover:text-gray-300 border border-gray-800 px-3 py-1.5 rounded-lg transition-colors">
                          {isExpanded ? "Ocultar pagos" : `Ver pagos (${susc.pagos.length})`}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Historial de pagos */}
              {isExpanded && susc && susc.pagos.length > 0 && (
                <div className="border-t border-gray-800 px-5 pb-4">
                  <p className="text-xs text-gray-600 uppercase tracking-wider pt-3 pb-2">Historial de pagos</p>
                  <div className="space-y-2">
                    {susc.pagos.map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-gray-800/50 rounded-xl px-4 py-2.5">
                        <div>
                          <span className="text-green-400 font-semibold">${p.monto.toFixed(2)}</span>
                          <span className="text-gray-500 text-xs ml-3">{fmt(p.fecha)}</span>
                          {p.referencia && <span className="text-gray-600 text-xs ml-3">Ref: {p.referencia}</span>}
                          {p.notas     && <span className="text-gray-600 text-xs ml-3">{p.notas}</span>}
                        </div>
                        <button onClick={() => eliminarPago(p.id, susc.id, p.monto)}
                          className="text-xs text-red-700 hover:text-red-400 transition-colors">
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isExpanded && susc && susc.pagos.length === 0 && (
                <div className="border-t border-gray-800 px-5 py-3 text-sm text-gray-600 italic">
                  No hay pagos registrados.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal suscripción */}
      {suscModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-white font-bold text-lg mb-5">
              {empresas.find(e => e.id === suscModal)?.suscripcion ? "Editar suscripción" : "Crear suscripción"} —{" "}
              <span className="text-orange-400">{empresas.find(e => e.id === suscModal)?.nombre}</span>
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Estado</label>
                  <select value={suscForm.estado} onChange={ev => setSuscForm(f => ({ ...f, estado: ev.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none">
                    {ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Monto mensual ($)</label>
                  <input type="number" min={0} step={0.01} value={suscForm.montoMensual}
                    onChange={ev => setSuscForm(f => ({ ...f, montoMensual: ev.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none"
                    placeholder="0.00" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Fecha inicio</label>
                  <input type="date" value={suscForm.fechaInicio}
                    onChange={ev => setSuscForm(f => ({ ...f, fechaInicio: ev.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Fecha vencimiento</label>
                  <input type="date" value={suscForm.fechaVencimiento}
                    onChange={ev => setSuscForm(f => ({ ...f, fechaVencimiento: ev.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Notas</label>
                <textarea value={suscForm.notas} onChange={ev => setSuscForm(f => ({ ...f, notas: ev.target.value }))}
                  rows={2} maxLength={500}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none resize-none"
                  placeholder="Observaciones…" />
              </div>

              {error && <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setSuscModal(null); setError(null); }}
                  className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors">Cancelar</button>
                <button onClick={guardarSusc} disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/40 text-white font-semibold text-sm transition-colors">
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal pago */}
      {pagoModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-5">Registrar pago</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Monto ($)</label>
                  <input type="number" min={0} step={0.01} value={pagoForm.monto}
                    onChange={ev => setPagoForm(f => ({ ...f, monto: ev.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none"
                    placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Fecha</label>
                  <input type="date" value={pagoForm.fecha}
                    onChange={ev => setPagoForm(f => ({ ...f, fecha: ev.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Referencia</label>
                <input type="text" value={pagoForm.referencia}
                  onChange={ev => setPagoForm(f => ({ ...f, referencia: ev.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none"
                  placeholder="No. transferencia o cheque" />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Notas</label>
                <input type="text" value={pagoForm.notas}
                  onChange={ev => setPagoForm(f => ({ ...f, notas: ev.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none"
                  placeholder="Observación opcional" />
              </div>

              {error && <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setPagoModal(null); setError(null); }}
                  className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors">Cancelar</button>
                <button onClick={guardarPago} disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:bg-green-600/40 text-white font-semibold text-sm transition-colors">
                  {saving ? "Guardando…" : "Registrar pago"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
