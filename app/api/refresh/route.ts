import { NextResponse } from "next/server";
import { refreshData } from "@/lib/data";

export const maxDuration = 60;

export async function POST() {
  try {
    const data = await refreshData();
    return NextResponse.json({
      status: "ok",
      timestamp: data.timestamp,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
