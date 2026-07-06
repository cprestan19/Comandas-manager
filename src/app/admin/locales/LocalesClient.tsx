"use client";

import { useState }  from "react";
import { useRouter } from "next/navigation";

interface Empresa { id: string; nombre: string }

interface Local {
  id:                   string;
  nombre:               string;
  slug:                 string;
  descripcion:          string | null;
  activo:               boolean;
  displayToken:         string;
  umbralAmarilloMin:    number;
  umbralRojoMin:        number;
  tiempoDesaparicionMin: number;
  empresaId:            string | null;
  empresa:              Empresa | null;
  _count:               { usuarios: number; comandas: number };
}

interface Props { localesIniciales: Local[]; esSuperadmin: boolean; empresas: Empresa[] }

const EMPTY_FORM = {
  empresaId: "", nombre: "", slug: "", descripcion: "",
  umbralAmarilloMin: 3, umbralRojoMin: 7, tiempoDesaparicionMin: 0,
};

export default function LocalesClient({ localesIniciales, esSuperadmin, empresas }: Props) {
  const router = useRouter();
  const [locales,  setLocales]  = useState<Local[]>(localesIniciales);
  const [modal,    setModal]    = useState<"crear" | "editar" | null>(null);
  const [editando, setEditando] = useState<Local | null>(null);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [copiado,  setCopiado]  = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [regening, setRegening] = useState<string | null>(null);

  function abrirCrear() {
    setForm({ ...EMPTY_FORM, empresaId: empresas[0]?.id ?? "" });
    setEditando(null); setError(null); setModal("crear");
  }

  function abrirEditar(local: Local) {
    setForm({
      empresaId:            local.empresaId ?? "",
      nombre:               local.nombre,
      slug:                 local.slug,
      descripcion:          local.descripcion ?? "",
      umbralAmarilloMin:    local.umbralAmarilloMin,
      umbralRojoMin:        local.umbralRojoMin,
      tiempoDesaparicionMin: local.tiempoDesaparicionMin,
    });
    setEditando(local); setError(null); setModal("editar");
  }

  function cerrarModal() { setModal(null); setEditando(null); setError(null); }

  function slugify(text: string) {
    return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");
  }

  async function guardar() {
    setSaving(true); setError(null);
    try {
      const payload = { ...form, descripcion: form.descripcion.trim() || null };
      if (modal === "editar") delete (payload as Record<string, unknown>).slug;
      const url    = modal === "crear" ? "/api/admin/locales" : `/api/admin/locales/${editando!.id}`;
      const method = modal === "crear" ? "POST" : "PUT";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (!res.ok) { setError(data.error); return; }
      cerrarModal();
      router.refresh();
      if (modal === "crear") {
        const empresa = empresas.find(e => e.id === form.empresaId);
        setLocales(prev => [...prev, {
          ...data.local,
          descripcion: payload.descripcion,
          empresa: empresa ?? null,
          activo: true,
          _count: { usuarios: 0, comandas: 0 },
        }]);
      } else {
        setLocales(prev => prev.map(l => l.id === editando!.id ? { ...l, ...data.local, descripcion: payload.descripcion } : l));
      }
    } catch { setError("Error de conexión"); }
    finally { setSaving(false); }
  }

  async function toggleActivo(local: Local) {
    const res = await fetch(`/api/admin/locales/${local.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !local.activo }),
    });
    if (res.ok) setLocales(prev => prev.map(l => l.id === local.id ? { ...l, activo: !l.activo } : l));
  }

  async function eliminar(local: Local) {
    if (!confirm(`¿Eliminar el local "${local.nombre}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(local.id);
    const res  = await fetch(`/api/admin/locales/${local.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) alert(data.error);
    else setLocales(prev => prev.filter(l => l.id !== local.id));
    setDeleting(null);
  }

  async function regenToken(local: Local) {
    if (!confirm(`¿Regenerar el token de "${local.nombre}"? La URL anterior dejará de funcionar.`)) return;
    setRegening(local.id);
    const res  = await fetch(`/api/admin/locales/${local.id}/regen-token`, { method: "POST" });
    const data = await res.json();
    if (res.ok) setLocales(prev => prev.map(l => l.id === local.id ? { ...l, displayToken: data.local.displayToken } : l));
    else alert(data.error);
    setRegening(null);
  }

  function copiarUrl(tokenConParam: string) {
    const [token, qs] = tokenConParam.split("?");
    const url = `${window.location.origin}/display/${token}${qs ? `?${qs}` : ""}`;
    navigator.clipboard.writeText(url);
    setCopiado(tokenConParam);
    setTimeout(() => setCopiado(null), 2000);
  }

  const displayUrl = (token: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/display/${token}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Locales / Sucursales</h1>
          <p className="text-gray-500 text-sm mt-0.5">{locales.length} local(es) registrado(s)</p>
        </div>
        {esSuperadmin && (
          <button onClick={abrirCrear} className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition-colors">
            + Nuevo local
          </button>
        )}
      </div>

      {locales.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <div className="text-4xl mb-3">🏪</div>
          <p>{esSuperadmin ? "No hay locales. Crea el primero." : "No hay locales en tu restaurante."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {locales.map((local) => (
            <div key={local.id}
              className={`bg-gray-900 border rounded-2xl overflow-hidden ${local.activo ? "border-gray-800" : "border-gray-800 opacity-60"}`}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-white font-semibold">{local.nombre}</h2>
                      <span className="text-xs text-gray-500 font-mono bg-gray-800 px-1.5 py-0.5 rounded">/{local.slug}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${local.activo ? "bg-green-900/40 text-green-400" : "bg-red-900/30 text-red-400"}`}>
                        {local.activo ? "Activo" : "Inactivo"}
                      </span>
                      {local.empresa && (
                        <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded-full">
                          {local.empresa.nombre}
                        </span>
                      )}
                    </div>
                    {local.descripcion && <p className="text-gray-400 text-sm mt-1">{local.descripcion}</p>}
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-gray-600">
                      <span>🟡 Amarillo: <strong className="text-gray-400">{local.umbralAmarilloMin} min</strong></span>
                      <span>🔴 Rojo: <strong className="text-gray-400">{local.umbralRojoMin} min</strong></span>
                      <span>⏳ Auto-ocultar: <strong className="text-gray-400">{local.tiempoDesaparicionMin > 0 ? `${local.tiempoDesaparicionMin} min` : "Nunca"}</strong></span>
                      <span>👥 <strong className="text-gray-400">{local._count.usuarios}</strong> usuario(s)</span>
                      <span>📋 <strong className="text-gray-400">{local._count.comandas}</strong> comanda(s) total</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => abrirEditar(local)} className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-2.5 py-1.5 rounded-lg transition-colors">
                      Editar
                    </button>
                    <button onClick={() => toggleActivo(local)} className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${local.activo ? "border-yellow-800 text-yellow-600 hover:text-yellow-400" : "border-green-800 text-green-600 hover:text-green-400"}`}>
                      {local.activo ? "Desactivar" : "Activar"}
                    </button>
                    {esSuperadmin && (
                      <button onClick={() => eliminar(local)} disabled={deleting === local.id} className="text-xs text-red-700 hover:text-red-400 border border-red-900/40 hover:border-red-700 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                        {deleting === local.id ? "…" : "Eliminar"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-800 bg-gray-950/50 px-4 py-3">
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">📺 URL del Display</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <code className="flex-1 text-xs text-orange-300 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 font-mono truncate min-w-0">
                    {displayUrl(local.displayToken)}?modo=pantalla
                  </code>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => copiarUrl(local.displayToken + "?modo=pantalla")}
                      className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${copiado === local.displayToken + "?modo=pantalla" ? "border-green-700 text-green-400 bg-green-900/20" : "border-orange-800 text-orange-400 hover:bg-orange-900/20"}`}>
                      {copiado === local.displayToken + "?modo=pantalla" ? "✓ Copiado" : "📋 Copiar"}
                    </button>
                    <a href={`/display/${local.displayToken}?modo=pantalla`} target="_blank"
                      className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors">
                      Abrir ↗
                    </a>
                    {esSuperadmin && (
                      <button onClick={() => regenToken(local)} disabled={regening === local.id}
                        title="Regenerar token invalida la URL anterior"
                        className="text-xs text-red-700 hover:text-red-400 border border-red-900/30 px-2.5 py-2 rounded-lg transition-colors disabled:opacity-40">
                        {regening === local.id ? "…" : "🔄"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear / editar */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-white font-bold text-lg mb-5">
              {modal === "crear" ? "Nuevo local" : `Editar: ${editando?.nombre}`}
            </h2>

            <div className="space-y-4">
              {/* Selector empresa (solo crear, solo superadmin) */}
              {modal === "crear" && esSuperadmin && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Restaurante *</label>
                  <select value={form.empresaId} onChange={e => setForm(f => ({ ...f, empresaId: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors">
                    {empresas.length === 0 && <option value="">— Sin restaurantes —</option>}
                    {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                  {empresas.length === 0 && (
                    <p className="text-xs text-yellow-500 mt-1">Crea un restaurante primero en /admin/empresas</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Nombre del local</label>
                <input type="text" value={form.nombre}
                  onChange={e => {
                    const n = e.target.value;
                    setForm(f => ({ ...f, nombre: n, slug: modal === "crear" ? slugify(n) : f.slug }));
                  }}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors"
                  placeholder="Sucursal Central" />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Descripción <span className="text-gray-600">(opcional)</span></label>
                <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  rows={2} maxLength={300}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors resize-none"
                  placeholder="Dirección, horarios, notas…" />
              </div>

              {modal === "crear" && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Slug (URL)</label>
                  <input type="text" value={form.slug}
                    onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm font-mono outline-none transition-colors"
                    placeholder="sucursal-central" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">🟡 Amarillo (min)</label>
                  <input type="number" min={1} max={60} value={form.umbralAmarilloMin}
                    onChange={e => setForm(f => ({ ...f, umbralAmarilloMin: Number(e.target.value) }))}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">🔴 Rojo (min)</label>
                  <input type="number" min={1} max={120} value={form.umbralRojoMin}
                    onChange={e => setForm(f => ({ ...f, umbralRojoMin: Number(e.target.value) }))}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">
                  ⏳ Auto-ocultar del display (min) <span className="text-gray-600 normal-case">— 0 = nunca</span>
                </label>
                <input type="number" min={0} max={60} value={form.tiempoDesaparicionMin}
                  onChange={e => setForm(f => ({ ...f, tiempoDesaparicionMin: Number(e.target.value) }))}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors"
                  placeholder="0" />
              </div>

              {error && <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button onClick={cerrarModal} className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors">
                  Cancelar
                </button>
                <button onClick={guardar} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/40 text-white font-semibold text-sm transition-colors">
                  {saving ? "Guardando…" : modal === "crear" ? "Crear local" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
