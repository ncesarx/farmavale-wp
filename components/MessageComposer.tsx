"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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
  const [assistance, setAssistance] = useState<{ resumo: string; intencao: string; sugestao: string } | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const assistRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => { assistRequest.current?.abort(); };
  }, [conversationId]);

  async function requestAssistance() {
    if (assisting || !canSend) return;
    const controller = new AbortController();
    assistRequest.current = controller;
    setAssisting(true);
    setAssistance(null);
    setAssistError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/assist`, {
        method: "POST",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) {
        const errors: Record<string, string> = {
          ai_not_configured: "A assistência por IA ainda não está habilitada.",
          ai_busy: "A IA está atendendo outra solicitação. Tente novamente em instantes.",
          ai_rate_limited: "Aguarde um minuto antes de solicitar novamente.",
          ai_timeout: "A IA demorou para responder. Tente novamente.",
          ai_empty_conversation: "Não há mensagens de texto para analisar.",
          ai_conversation_changed: "A conversa recebeu novas mensagens. Gere uma nova análise.",
          forbidden: "Você não tem permissão para analisar este atendimento.",
          conversation_not_sendable: "Abra ou reabra o atendimento para usar a assistência.",
          ai_invalid_response: "A IA retornou uma resposta incompleta. Tente novamente.",
        };
        throw new Error(errors[result?.error] ?? "A IA está indisponível. Você pode continuar o atendimento normalmente.");
      }
      if (!controller.signal.aborted) setAssistance(result.assistance);
    } catch (error) {
      if (!controller.signal.aborted) setAssistError(error instanceof Error ? error.message : "Falha ao consultar a IA.");
    } finally {
      if (!controller.signal.aborted) setAssisting(false);
    }
  }
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
      setAssistance(null);
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
    <div className="composerArea">
      <section className="assistPanel" aria-label="Assistência por IA">
        <button type="button" disabled={!canSend || assisting || sending} onClick={requestAssistance}>
          {assisting ? "Analisando conversa…" : "Analisar com IA"}
        </button>
        <small>A IA pode errar. Confira preços, estoque e entrega antes de enviar.</small>
        {assisting ? <p role="status">A análise pode levar até 90 segundos. Você pode continuar escrevendo.</p> : null}
        {assistError ? <p role="alert">{assistError}</p> : null}
        {assistance ? <div aria-live="polite">
          <p><strong>Resumo:</strong> {assistance.resumo}</p>
          <p><strong>Intenção:</strong> {assistance.intencao}</p>
          <p><strong>Sugestão para revisão:</strong> {assistance.sugestao}</p>
          <button type="button" disabled={!canSend || sending} onClick={() => {
            if (body.trim()) {
              setAssistError("O campo já contém um rascunho. Copie o trecho desejado ou limpe o campo antes de usar a sugestão.");
              return;
            }
            setBody(assistance.sugestao);
            setAssistError(null);
            setAssistance(null);
          }}>Usar como rascunho</button>
          <button type="button" onClick={() => setAssistance(null)}>Descartar</button>
        </div> : null}
      </section>
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
    </div>
  );
}
