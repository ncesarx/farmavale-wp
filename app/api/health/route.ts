import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "farmavale-central",
    timestamp: new Date().toISOString(),
  });
}
