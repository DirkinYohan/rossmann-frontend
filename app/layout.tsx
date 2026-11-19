import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navegacion } from "@/components/Navegacion";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Rossmann · Predicción de ventas", template: "%s · Rossmann" },
  description: "Predicción de ventas con series de tiempo (SARIMAX y GRU) sobre Rossmann Store Sales.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Navegacion />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        <footer className="border-t border-borde px-4 py-4 text-center text-xs text-tenue">
          Proyecto académico de Minería de Datos · Dataset Rossmann Store Sales (Kaggle) · Modelos entrenados offline en Python
        </footer>
      </body>
    </html>
  );
}
