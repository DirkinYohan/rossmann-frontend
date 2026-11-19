import type { Metadata } from "next";
import { DashboardCliente } from "@/components/dashboard/DashboardCliente";

export const metadata: Metadata = { title: "Dashboard de predicción" };

export default function Page() {
  return <DashboardCliente />;
}
