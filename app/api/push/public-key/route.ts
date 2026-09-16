import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPushConfiguration } from "@/lib/web-push";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const config = getPushConfiguration();
  if (!config.configured || !config.publicKey) return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  return NextResponse.json({ publicKey: config.publicKey });
}
