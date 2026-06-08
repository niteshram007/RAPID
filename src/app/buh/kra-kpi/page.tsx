import { KraKpiDashboard } from "@/components/kra-kpi-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BuhKraKpiPage() {
  return <KraKpiDashboard metricMode="budget" />;
}
