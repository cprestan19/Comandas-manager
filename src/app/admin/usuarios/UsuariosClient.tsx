"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

interface Empresa { id: string; nombre: string }
interface Local   { id: string; nombre: string; empresaId?: string | null }

interface Usuario {
  id:      string;
  nombre:  string;
  email:   string;
  rol:     string;
  activo:  boolean;
  empresa: Empresa | null;
  local:   Local   | null;
}

interface Props {
  usuariosIniciales: Usuario[];
  locales:           Local[];
  empresas:          Empresa[];
  esSuperadmin:      boolean;
  miEmpresaId:       string | null;
}

const ROLES_SUPERADMIN = [
  { value: "SUPERADMIN",  label: "Super Admin",  color: "text-purple-400" },
  { value: "ADMIN_LOCAL", label: "Admin",         color: "text-blue-400"   },
  { value: "COCINA",      label: "Cocina",        color: "text-orange-400" },
];
const ROLES_ADMIN = ROLES_SUPERADMIN.filter(r => r.value !== "SUPERADMIN");

const EMPTY_FORM = { nombre: "", email: "", password: "", rol: "COCINA", empresaId: "", localId: "" };

export default function UsuariosClient({ usuariosIniciales, locales, empresas, esSuperadmin, miEmpresaId }: Props) {
  const { data: session } = useSession();
  const roles = esSuperadmin ? ROLES_SUPERADMIN : ROLES_ADMIN;

  const [usuarios, setUsuarios] = useState<Usuario[]>(usuariosIniciales);
  const [modal,    setModal]    = useState<"crear" | "editar" | null>(null);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Locales filtrados por empresa seleccionada en el form
  const localesFiltrados = form.empresaId
    ? locales.filter(l => l.empresaId === form.empresaId)
    : (esSuperadmin ? [] : locales);

  function primeraLocal(empId: string) {
    return locales.filter(l => l.empresaId === empId)[0]?.id ?? "";
  }

  function abrirCrear() {
    const defaultEmp   = esSuperadmin ? (empresas[0]?.id ?? "") : (miEmpresaId ?? "");
    const defaultLocal = primeraLocal(defaultEmp);
    setForm({ ...EMPTY_FORM, empresaId: defaultEmp, localId: defaultLocal });
    setEditando(null); setError(null); setModal("crear");
  }

  function abrirEditar(u: Usuario) {
    setForm({
      nombre:    u.nombre,
      email:     u.email,
      password:  "",
      rol:       u.rol,
      empresaId: u.empresa?.id ?? "",
      localId:   u.local?.id ?? "",
    });
    setEditando(u); setError(null); setModal("editar");
  }

  function cerrar() { setModal(null); setEditando(null); setError(null); }

  async function guardar() {
    setSaving(true); setError(null);
    try {
      const payload: Record<string, unknown> = {
        nombre:    form.nombre,
        email:     form.email,
        rol:       form.rol,
        empresaId: form.empresaId || undefined,
        localId:   form.rol === "COCINA" && form.localId ? form.localId : null,
      };
      if (form.password) payload.password = form.password;
      if (modal === "editar" && !form.password) delete payload.password;

      const url    = modal === "crear" ? "/api/admin/usuarios" : `/api/admin/usuarios/${editando!.id}`;
      const method = modal === "crear" ? "POST" : "PUT";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (!res.ok) { setError(data.error); return; }
      cerrar();
      if (modal === "crear") {
        setUsuarios(prev => [...prev, { ...data.usuario, activo: true }]);
      } else {
        setUsuarios(prev => prev.map(u => u.id === editando!.id
          ? { ...u, ...data.usuario }
          : u
        ));
      }
    } catch { setError("Error de conexión"); }
    finally { setSaving(false); }
  }

  async function toggleActivo(u: Usuario) {
    const res = await fetch(`/api/admin/usuarios/${u.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !u.activo }),
    });
    if (res.ok) setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, activo: !x.activo } : x));
  }

  async function eliminar(u: Usuario) {
    if (!confirm(`¿Eliminar al usuario "${u.nombre}"?`)) return;
    setDeleting(u.id);
    const res  = await fetch(`/api/admin/usuarios/${u.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) alert(data.error);
    else setUsuarios(prev => prev.filter(x => x.id !== u.id));
    setDeleting(null);
  }

  const rolInfo = (rol: string) => ROLES_SUPERADMIN.find(r => r.value === rol) ?? { label: rol, color: "text-gray-400" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Usuarios</h1>
          <p className="text-gray-500 text-sm mt-0.5">{usuarios.length} usuario(s)</p>
        </div>
        <button onClick={abrirCrear}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition-colors">
          + Nuevo usuario
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Nombre</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Rol</th>
              {esSuperadmin && <th className="px-4 py-3 text-left">Restaurante</th>}
              <th className="px-4 py-3 text-left">Local</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {usuarios.map((u) => (
              <tr key={u.id} className={`bg-gray-900/50 hover:bg-gray-900 transition-colors ${!u.activo ? "opacity-50" : ""}`}>
                <td className="px-4 py-3 text-white font-medium">{u.nombre}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`font-semibold ${rolInfo(u.rol).color}`}>{rolInfo(u.rol).label}</span>
                </td>
                {esSuperadmin && (
                  <td className="px-4 py-3 text-gray-400">{u.empresa?.nombre ?? <span className="text-gray-700 italic">—</span>}</td>
                )}
                <td className="px-4 py-3 text-gray-400">{u.local?.nombre ?? <span className="text-gray-700 italic">—</span>}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.activo ? "bg-green-900/40 text-green-400" : "bg-red-900/30 text-red-400"}`}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => abrirEditar(u)}
                      className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-2 py-1 rounded transition-colors">
                      Editar
                    </button>
                    <button onClick={() => toggleActivo(u)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${u.activo ? "border-yellow-900 text-yellow-600 hover:text-yellow-400" : "border-green-900 text-green-600 hover:text-green-400"}`}>
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>
                    {session?.user.id !== u.id && (
                      <button onClick={() => eliminar(u)} disabled={deleting === u.id}
                        className="text-xs text-red-700 hover:text-red-400 border border-red-900/40 px-2 py-1 rounded transition-colors disabled:opacity-40">
                        {deleting === u.id ? "…" : "Eliminar"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-white font-bold text-lg mb-5">
              {modal === "crear" ? "Nuevo usuario" : `Editar: ${editando?.nombre}`}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Nombre</label>
                <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors"
                  placeholder="Juan Pérez" />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  disabled={modal === "editar"}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors disabled:opacity-50"
                  placeholder="juan@restaurante.com" />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">
                  Contraseña {modal === "editar" && <span className="text-gray-600">(vacío = no cambiar)</span>}
                </label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors"
                  placeholder="••••••••" />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Rol</label>
                <select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value, localId: "" }))}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors">
                  {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {/* Empresa (solo SUPERADMIN, para roles que no son SUPERADMIN) */}
              {esSuperadmin && form.rol !== "SUPERADMIN" && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Restaurante</label>
                  <select value={form.empresaId} onChange={e => setForm(f => ({ ...f, empresaId: e.target.value, localId: primeraLocal(e.target.value) }))}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors">
                    {empresas.length === 0 && <option value="">— Sin restaurantes —</option>}
                    {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </div>
              )}

              {/* Local (solo si rol = COCINA) */}
              {form.rol === "COCINA" && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Local / Sucursal</label>
                  <select value={form.localId} onChange={e => setForm(f => ({ ...f, localId: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 focus:border-orange-500 rounded-lg px-3 py-2.5 text-white text-sm outline-none transition-colors">
                    {localesFiltrados.length === 0 && <option value="">— Sin locales —</option>}
                    {localesFiltrados.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                  </select>
                  {localesFiltrados.length === 0 && (
                    <p className="text-xs text-yellow-500 mt-1">Crea un local primero en /admin/locales</p>
                  )}
                </div>
              )}

              {error && (
                <p className="text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={cerrar} className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm transition-colors">
                  Cancelar
                </button>
                <button onClick={guardar} disabled={saving} className="flex-1 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/40 text-white font-semibold text-sm transition-colors">
                  {saving ? "Guardando…" : modal === "crear" ? "Crear usuario" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
