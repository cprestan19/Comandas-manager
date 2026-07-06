"use client";

import Link          from "next/link";
import { usePathname } from "next/navigation";
import { signOut }     from "next-auth/react";

interface Props {
  userName: string;
  userRole: string;
}

export default function AdminNav({ userName, userRole }: Props) {
  const pathname     = usePathname();
  const isSuperadmin = userRole === "SUPERADMIN";

  const links = [
    { href: "/admin",             label: "Dashboard",    always: true         },
    { href: "/admin/empresas",    label: "Restaurantes", onlySuperadmin: true },
    { href: "/admin/locales",     label: "Locales",      always: true         },
    { href: "/admin/usuarios",    label: "Usuarios",     always: true         },
    { href: "/admin/facturacion", label: "Facturación",  onlySuperadmin: true },
    { href: "/admin/reportes",    label: "Reportes",     always: true         },
  ].filter(l => l.always || (l.onlySuperadmin && isSuperadmin));

  return (
    <header className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <span className="text-white font-bold text-sm flex items-center gap-2">
            🍽️ <span className="text-orange-400">Comandas</span>
          </span>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {links.map((l) => {
              const active = l.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? "bg-orange-500/20 text-orange-400"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-500 hidden sm:block">
            {userName} · <span className="text-gray-600">{userRole}</span>
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
