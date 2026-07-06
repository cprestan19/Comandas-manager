"use client";

import { useState }    from "react";
import { useRouter }   from "next/navigation";

interface Suscripcion {
  estado:           string;
  fechaVencimiento: string | Date;
  montoMensual:     number;
}

interface Empresa {
  id:            string;
  nombre:        string;
  ruc:           string | null;
  contacto:      string | null;
  email:         string | null;
  telefono:      string | null;
  activo:        boolean;
  createdAt:     string | Date;
  suscripcion:   Suscripcion | null;
  _count:        { locales: number; usuarios: number };
  comandasTotal: number;
  comandasHoy:   number;
}

interface Props { empresasIniciales: Empresa[] }

const EMPTY_FORM = { nombre: "", ruc: "", contacto: "", email: "", telefono: "" };

function EstadoSuscBadge({ suscripcion }: { suscripcion: Suscripcion | null }) {
  if (!suscripcion) {
    return <span className="text-xs text-gray-600 italic">Sin suscripción</span>;
  }
  const vence = new Date(suscripcion.fechaVencimiento);
  const dias  = Math.ceil((vence.getTime() - Date.now()) / 86400000);
  const color = suscripcion.estado === "ACTIVA"
    ? dias < 7  ? "bg-yellow-900/40 text-yellow-400"
    : dias < 0  ? "bg-red-900/40 text-red-400"
    : "bg-green-900/40 text-green-400"
    : suscripcion.estado === "SUSPENDIDA" ? "bg-orange-900/40 text-orange-400"
    : "bg-red-900/40 text-red-400";

  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-xs px-2 py-0.5 rounded-full inline-block w-fit ${color}`}>
        {suscripcion.estado}
      </span>
      <span className="text-[11px] text-gray-600">
        Vence {new Date(suscripcion.fechaVencimiento).toLocaleDateString("es-PA")}
        {dias >= 0 ? ` (${dias}d)` : ` (vencida ${Math.abs(dias)}d)`}
      </span>
    </div>
  );
}

export default function EmpresasClient({ empresasIniciales }: Props) {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<Empresa[]>(empresasIniciales);
  const [modal,    setModal]    = useState<"crear" | "editar" | null>(null);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  function abrirCrear() {
    setForm(EMPTY_FORM); setEditando(null); setError(null); setModal("crear");
  }

  function abrirEditar(e: Empresa) {
    setForm({ nombre: e.nombre, ruc: e.ruc ?? "", contacto: e.contacto ?? "", email: e.email ?? "", telefono: e.telefono ?? "" });
    setEditando(e); setError(null); setModal("editar");
  }

  function cerrar() { setModal(null); setEditando(null); setError(null); }

  async function guardar() {
    setSaving(true); setError(null);
    try {
      const payload = {
        nombre:   form.nombre,
        ruc:      form.ruc      || null,
        contacto: form.contacto || null,
        email:    form.email    || null,
        telefono: form.telefono || null,
      };
      const url    = modal === "crear" ? "/api/admin/empresas" : `/api/admin/empresas/${editando!.id}`;
      const method = modal === "crear" ? "POST" : "PUT";
      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      cerrar();
      router.refresh();
      if (modal === "crear") {
        setEmpresas(prev => [...prev, { ...data.empresa, suscripcion: null, _count: { locales: 0, usuarios: 0 }, comandasTotal: 0, comandasHoy: 0 }]);
      } else {
        setEmpresas(prev => prev.map(e => e.id === editando!.id ? { ...e, ...data.empresa } : e));
      }
    } catch { setError("Error de conexión"); }
    finally { setSaving(false); }
  }

  async function eliminar(e: Empresa) {
    if (!confirm(`¿Eliminar "${e.nombre}"? Solo se puede si no tiene locales.`)) return;
    setDeleting(e.id);
    const res  = await fetch(`/api/admin/empresas/${e.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) alert(data.error);
    else setEmpresas(prev => prev.filter(x => x.id !== e.id));
    setDeleting(null);
  }

  async function toggleActivo(e: Empresa) {
    const res = await fetch(`/api/admin/empresas/${e.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !e.activo }),
    });
    if (res.ok) setEmpresas(prev => prev.map(x => x.id === e.id ? { ...x, activo: !x.activo } : x));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Restaurantes</h1>
          <p className="text-gray-500 text-sm mt-0.5">{empresas.length} restaurante(s) registrado(s)</p>
        </div>
        <button onClick={abrirCrear} className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition-colors">
          + Nuevo restaurante
        </button>
      </div>

      {empresas.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <div className="text-5xl mb-3">🏢</div>
          <p className="font-medium">No hay restaurantes registrados.</p>
          <p className="text-sm mt-1 text-gray-700">Crea el primero para empezar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {empresas.map((e) => (
            <div key={e.id} className={`bg-gray-900 border rounded-2xl p-5 ${e.activo ? "border-gray-800" : "border-gray-800 opacity-60"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-white font-semibold text-lg">{e.nombre}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${e.activo ? "bg-green-900/40 text-green-400" : "bg-red-900/30 text-red-400"}`}>
                      {e.activo ? "Activo" : "Inactivo"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-500">
                    {e.ruc      && <span>RUC: <strong className="text-gray-300">{e.ruc}</strong></span>}
                    {e.contacto && <span>Contacto: <strong className="text-gray-300">{e.contacto}</strong></span>}
                    {e.email    && <span>Email: <strong className="text-gray-300">{e.email}</strong></span>}
                    {e.telefono && <span>Tel: <strong className="text-gray-300">{e.telefono}</strong></span>}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-white">{e._count.locales}</div>
                      <div className="text-xs text-gray-500 mt-0.5">Sucursal(es)</div>
                    </div>
                    <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-white">{e._count.usuarios}</div>
                      <div className="text-xs text-gray-500 mt-0.5">Usuario(s)</div>
                    </div>
                    <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-orange-400">{e.comandasHoy}</div>
                      <div className="text-xs text-gray-500 mt-0.5">Comandas hoy</div>
                    </div>
                    <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold text-gray-300">{e.comandasTotal}</div>
                      <div className="text-xs text-gray-500 mt-0.5">Comandas total</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <EstadoSuscBadge suscripcion={e.suscripcion} />
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <button onClick={() => abrirEditar(e)} className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors">
                    Editar
                  </button>
                  <button onClick={() => toggleActivo(e)} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${e.activo ? "border-yellow-800 text-yellow-600 hover:text-yellow-400" : "border-green-800 text-green-600 hover:text-green-400"}`}>
                    {e.activo ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => eliminar(e)} disabled={deleting === e.id} className="text-xs text-red-700 hover:text-red-400 border border-red-900/40 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                    {deleting === e.id ? "…" : "Eliminar"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-white font-bold text-lg mb-5">
              {modal === "crear" ? "Nuevo restaurante" : `Editar: ${editando?.nombre}`}
            </h2>

            <div className="space-y-4">
              {[
                { key: "nombre",   label: "Nombre del restaurante *", placeholder: "Mi Restaurante" },
                { key: "ruc",      label: "RUC / NIT",                placeholder: "123-456-789" },
                { key: "contacto", label: "Nombre de contacto",       placeholder: "Juan Pérez" },
                { key: "email",    label: "Email de contacto",        placeholder: "contacto@restaurante.com" },
                { key: "telefono", label: "Teléfono",                 placeholder: "+507 6000-0000" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">{f.label}</label>
                  <input
                    type={f.key === "email" ? "email" : "text"}
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors"
                  />
                </div>
              ))}

              {error && <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button onClick={cerrar} className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors">Cancelar</button>
                <button onClick={guardar} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/40 text-white font-semibold text-sm transition-colors">
                  {saving ? "Guardando…" : modal === "crear" ? "Crear restaurante" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
