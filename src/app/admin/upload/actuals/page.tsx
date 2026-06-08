import { AdminUploadDatasetPage } from "@/components/admin-upload-dataset-page";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminUploadActualsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return <AdminUploadDatasetPage pageKey="actuals" searchParams={await searchParams} />;
}
