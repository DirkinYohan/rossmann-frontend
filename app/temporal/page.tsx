import type { Metadata } from "next";
import { TemporalCliente } from "@/components/temporal/TemporalCliente";

export const metadata: Metadata = { title: "Visualización temporal" };

export default function Page() {
  return <TemporalCliente />;
}
