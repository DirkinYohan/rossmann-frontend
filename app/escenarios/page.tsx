import type { Metadata } from "next";
import { EscenariosCliente } from "@/components/escenarios/EscenariosCliente";

export const metadata: Metadata = { title: "Simulación de escenarios" };

export default function Page() {
  return <EscenariosCliente />;
}
