import { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";

export function hasTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin === new URL(getEnv().APP_BASE_URL).origin;
}
