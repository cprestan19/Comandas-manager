"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { signOut } from "next-auth/react";

type Feedback = { tipo: "ok" | "error"; mensaje: string } | null;

interface Props {
  userName: string;
  userRole: string;
}

export default function CocinaClient({ userName, userRole }: Props) {
  const [numero,   setNumero]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [undoing,  setUndoing]  = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Foco automático al montar y tras cada feedback
  useEffect(() => { inputRef.current?.focus(); }, []);

  function clearFeedback() {
    setFeedback(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const showFeedback = useCallback((tipo: "ok" | "error", mensaje: string) => {
    setFeedback({ tipo, mensaje });
    setTimeout(clearFeedback, 3000);
  }, []);

  async function enviar() {
    const n = numero.trim();
    if (!n) { showFeedback("error", "Ingresa el número de comanda"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/comandas", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ numero: n }),
      });
      const data = await res.json();
      if (!res.ok) { showFeedback("error", data.error ?? "Error al enviar"); return; }
      setNumero("");
      showFeedback("ok", `Comanda #${n} marcada como LISTA ✓`);
    } catch {
      showFeedback("error", "Sin conexión — reintenta");
    } finally {
      setLoading(false);
    }
  }

  async function deshacer() {
    setUndoing(true);
    try {
      const res = await fetch("/api/comandas/deshacer", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { showFeedback("error", data.error ?? "No hay comanda para deshacer"); return; }
      showFeedback("ok", `Comanda #${data.deshecho?.numero} eliminada`);
    } catch {
      showFeedback("error", "Sin conexión");
    } finally {
      setUndoing(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") enviar();
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-2">
          <span className="text-xl">🍳</span>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">{userName}</p>
            <p className="text-gray-500 text-xs">{userRole}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1"
        >
          Salir
        </button>
      </header>

      {/* Feedback toast */}
      {feedback && (
        <div
          className={`mx-4 mt-4 px-4 py-3 rounded-xl text-center font-bold text-lg transition-all ${
            feedback.tipo === "ok"
              ? "bg-green-900/60 border border-green-700 text-green-300"
              : "bg-red-900/60 border border-red-700 text-red-300"
          }`}
        >
          {feedback.mensaje}
        </div>
      )}

      {/* Área principal */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 gap-6">
        <div className="w-full max-w-xs space-y-6">

          {/* Label */}
          <p className="text-center text-gray-400 text-sm uppercase tracking-widest font-medium">
            Número de comanda
          </p>

          {/* Input grande */}
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            value={numero}
            onChange={(e) => setNumero(e.target.value.slice(0, 10))}
            onKeyDown={handleKey}
            maxLength={10}
            placeholder="ej. 42 · A12 · 001"
            className="w-full text-center text-5xl font-bold tracking-widest bg-gray-900 border-2 border-gray-700 focus:border-orange-500 focus:ring-0 rounded-2xl py-6 px-4 text-white placeholder-gray-700 outline-none transition-colors"
            autoComplete="off"
            spellCheck={false}
          />

          {/* Botón ENVIAR */}
          <button
            onClick={enviar}
            disabled={loading || !numero.trim()}
            className="w-full py-5 rounded-2xl bg-orange-500 hover:bg-orange-400 active:scale-95 disabled:bg-orange-500/30 disabled:cursor-not-allowed text-white text-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-orange-900/30"
          >
            {loading ? "Enviando…" : "✓ Lista"}
          </button>

          {/* Botón DESHACER */}
          <button
            onClick={deshacer}
            disabled={undoing}
            className="w-full py-3 rounded-xl border border-gray-700 hover:border-red-700 text-gray-500 hover:text-red-400 text-sm font-medium transition-all"
          >
            {undoing ? "Deshaciendo…" : "↩ Deshacer última"}
          </button>
        </div>
      </main>

      {/* Footer info */}
      <footer className="text-center text-xs text-gray-700 py-3 pb-6">
        Máx. 10 caracteres · Enter para enviar
      </footer>
    </div>
  );
}
