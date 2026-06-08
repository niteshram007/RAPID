import { NextResponse } from "next/server";

import { getSessionProfile } from "@/lib/auth";

export async function POST() {
  const session = await getSessionProfile();

  if (!session) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    { detail: "Manual master data editing is disabled. Upload workbooks instead." },
    { status: 403 },
  );
}
