import type { Metadata } from "next";
import { PrediccionCliente } from "@/components/prediccion/PrediccionCliente";

export const metadata: Metadata = { title: "Predicción personalizada" };

export default function Page() {
  return <PrediccionCliente />;
}
