import { NextResponse } from "next/server";
import { getCachedData } from "@/lib/data";

export async function GET() {
  const data = getCachedData();
  if (!data) {
    return NextResponse.json(
      { error: "No data available. Run /api/refresh first." },
      { status: 404 }
    );
  }
  return NextResponse.json(data);
}
