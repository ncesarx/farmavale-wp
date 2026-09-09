import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  RealtimeEvent,
  subscribeToRealtimeEvents,
} from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

function serialize(event: RealtimeEvent) {
  return encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const organizationSlug = user.organization.slug;
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        controller.close();
      };

      const unsubscribe = subscribeToRealtimeEvents((event) => {
        if (event.organizationSlug !== organizationSlug || closed) return;
        controller.enqueue(serialize(event));
      });

      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 25_000);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      controller.enqueue(encoder.encode("retry: 3000\n: connected\n\n"));
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
