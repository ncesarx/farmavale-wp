import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasTrustedOrigin } from "@/lib/http-security";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { AssistError, canUseAssistance, generateAssistance } from "@/lib/ai-assist";

export const runtime = "nodejs";
export const maxDuration = 100;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedOrigin(request)) return json({ error: "invalid_origin" }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  if (process.env.AI_ASSIST_ENABLED !== "true" || !process.env.OLLAMA_BASE_URL || !process.env.OLLAMA_MODEL) {
    return json({ error: "ai_not_configured" }, 503);
  }
  const { id } = await context.params;
  const conversation = await prisma.conversation.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, assignedAgentId: true, status: true },
  });
  if (!conversation) return json({ error: "not_found" }, 404);
  if (!canUseAssistance(user.role, user.id, conversation.assignedAgentId)) return json({ error: "forbidden" }, 403);
  if (!["OPEN", "PENDING"].includes(conversation.status)) return json({ error: "conversation_not_sendable" }, 409);
  const limit = consumeRateLimit(`assist:${user.id}`, 3, 60_000);
  if (!limit.allowed) return json({ error: "ai_rate_limited" }, 429);

  const messages = await prisma.message.findMany({
    where: {
      conversationId: id,
      direction: { in: ["INBOUND", "OUTBOUND"] },
      status: { notIn: ["FAILED", "QUEUED"] },
      body: { not: null },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 12,
    select: { id: true, direction: true, body: true },
  });
  try {
    const assistance = await generateAssistance([...messages].reverse(), {
      url: process.env.OLLAMA_BASE_URL,
      model: process.env.OLLAMA_MODEL,
    });
    // Assignment/status may change while inference is running.
    const current = await prisma.conversation.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { assignedAgentId: true, status: true },
    });
    if (!current || !canUseAssistance(user.role, user.id, current.assignedAgentId)) return json({ error: "forbidden" }, 403);
    if (!["OPEN", "PENDING"].includes(current.status)) return json({ error: "conversation_not_sendable" }, 409);
    const latest = await prisma.message.findFirst({
      where: { conversationId: id, direction: { in: ["INBOUND", "OUTBOUND"] }, status: { notIn: ["FAILED", "QUEUED"] }, body: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    if (latest?.id !== messages[0]?.id) return json({ error: "ai_conversation_changed" }, 409);
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId, actorId: user.id,
        action: "AI_ASSIST_GENERATED", entityType: "Conversation", entityId: id,
        metadata: { provider: "ollama", model: process.env.OLLAMA_MODEL, messageCount: messages.length },
      },
    });
    return json({ assistance });
  } catch (error) {
    const code = error instanceof AssistError ? error.code : "ai_unavailable";
    return json({ error: code }, code === "ai_empty_conversation" ? 409 : code === "ai_busy" ? 429 : 503);
  }
}
