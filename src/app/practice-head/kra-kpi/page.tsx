import { KraKpiDashboard } from "@/components/kra-kpi-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PracticeHeadKraKpiPage() {
  return <KraKpiDashboard metricMode="forecast" />;
}
