"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ENLACES = [
  { href: "/dashboard", texto: "Dashboard" },
  { href: "/escenarios", texto: "Escenarios" },
  { href: "/temporal", texto: "Visualización temporal" },
];

export function Navegacion() {
  const ruta = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-borde bg-superficie/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-xs font-bold text-white">R</span>
          Rossmann · Predicción de ventas
        </Link>
        <nav className="-mx-1 flex gap-1 overflow-x-auto text-sm">
          {ENLACES.map((e) => {
            const activo = ruta === e.href;
            return (
              <Link
                key={e.href}
                href={e.href}
                aria-current={activo ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 transition-colors ${
                  activo ? "bg-background font-medium text-foreground" : "text-tenue hover:text-foreground"
                }`}
              >
                {e.texto}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
