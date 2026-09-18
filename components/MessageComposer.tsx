"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  conversationId: string;
  canSend: boolean;
  disabledReason?: string;
  quickReplies?: Array<{ id: string; title: string; shortcut: string; body: string }>;
};

export function MessageComposer({
  conversationId,
  canSend,
  disabledReason,
  quickReplies = [],
}: Props) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending || !canSend) return;

    setSending(true);
    setFeedback(null);
    const clientRequestId = crypto.randomUUID();

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text, clientRequestId }),
        },
      );
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        const messages: Record<string, string> = {
          meta_rejected: "A Meta recusou o envio. Verifique o número e a conta.",
          conversation_not_sendable: "Este atendimento não está disponível para resposta.",
          forbidden: "O atendimento está atribuído a outro agente.",
          whatsapp_not_configured: "O canal do WhatsApp não está configurado.",
        };
        throw new Error(messages[result?.error ?? ""] ?? "Não foi possível enviar a mensagem.");
      }

      setBody("");
      setFeedback("Mensagem enviada.");
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Falha no envio.");
    } finally {
      setSending(false);
    }
  }

  function selectQuickReply(id: string) {
    const reply = quickReplies.find((item) => item.id === id);
    if (!reply) return;
    setBody(reply.body);
    void fetch(`/api/quick-replies/${reply.id}/use`, { method: "POST" });
  }

  return (
    <form className="composer" onSubmit={sendMessage}>
      <div>
        {quickReplies.length ? <select aria-label="Resposta rápida" defaultValue="" onChange={(event) => { selectQuickReply(event.target.value); event.currentTarget.value = ""; }} disabled={!canSend || sending}><option value="" disabled>⌘ Resposta rápida…</option>{quickReplies.map((reply) => <option key={reply.id} value={reply.id}>{reply.shortcut} · {reply.title}</option>)}</select> : null}
        <textarea
          aria-label="Mensagem"
          placeholder={canSend ? "Digite uma mensagem…" : disabledReason}
          value={body}
          maxLength={4096}
          disabled={!canSend || sending}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <small className={feedback?.startsWith("Mensagem enviada") ? "composerOk" : "composerError"}>
          {feedback ?? (canSend ? "Enter envia · Shift + Enter quebra a linha" : disabledReason)}
        </small>
      </div>
      <button type="submit" disabled={!canSend || sending || !body.trim()}>
        {sending ? "Enviando…" : "Enviar ➤"}
      </button>
    </form>
  );
}
