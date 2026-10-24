import assert from "node:assert/strict";
import test from "node:test";
import { AssistError, canUseAssistance, generateAssistance, parseAssistance, prepareAssistMessages } from "./ai-assist";

test("isolates assigned agents and excludes analysts", () => {
  assert.equal(canUseAssistance("AGENT", "a", "b"), false);
  assert.equal(canUseAssistance("AGENT", "a", "a"), true);
  assert.equal(canUseAssistance("ANALYST", "a", "a"), false);
  assert.equal(canUseAssistance("ADMIN", "a", null), true);
});

test("bounds history and excludes internal notes and identifiers", () => {
  const messages = Array.from({ length: 15 }, (_, i) => ({ direction: "INBOUND", body: `Mensagem ${i} ` + "x".repeat(600) }));
  messages.push({ direction: "INTERNAL", body: "segredo" });
  const prepared = prepareAssistMessages(messages);
  assert.equal(prepared.length, 12);
  assert.ok(prepared.every(item => item.texto.length <= 500));
  const [redacted] = prepareAssistMessages([{ direction: "INBOUND", body: "ana@example.com 123.456.789-00 (11) 99999-9999" }]);
  assert.equal(redacted.texto, "[email] [documento] [telefone]");
});

test("rejects malformed and oversized model output", () => {
  for (const content of ["bad", "null", "[]", '{"resumo":"x"}', JSON.stringify({ resumo: "x".repeat(1201), intencao: "x", sugestao: "x" })]) {
    assert.throws(() => parseAssistance(content), AssistError);
  }
});

test("uses configured local endpoint and never follows redirects", async () => {
  const fake = (async (url: URL, init: RequestInit) => {
    assert.equal(url.toString(), "http://172.30.172.222:11434/api/chat");
    assert.equal(init.redirect, "error");
    const body = JSON.parse(init.body as string);
    assert.equal(body.stream, false);
    assert.equal(body.options.num_ctx, 4096);
    assert.equal(body.messages.length, 2);
    return Response.json({ done: true, done_reason: "stop", message: { content: JSON.stringify({ resumo: "Resumo", intencao: "Consulta", sugestao: "Vou verificar." }) } });
  }) as typeof fetch;
  const result = await generateAssistance([{ direction: "INBOUND", body: "Olá" }], { url: "http://172.30.172.222:11434", model: "local" }, fake);
  assert.equal(result.sugestao, "Vou verificar.");
});

test("rejects concurrent generation and releases the slot after a failure", async () => {
  let finish!: (response: Response) => void;
  const waiting = new Promise<Response>(resolve => { finish = resolve; });
  const config = { url: "http://127.0.0.1:11434", model: "local" };
  const messages = [{ direction: "INBOUND", body: "Olá" }];
  const running = generateAssistance(messages, config, (() => waiting) as typeof fetch);
  await assert.rejects(generateAssistance(messages, config), { code: "ai_busy" });
  finish(Response.json({}, { status: 500 }));
  await assert.rejects(running, { code: "ai_unavailable" });
  await assert.rejects(generateAssistance(messages, config, (async () => { throw new DOMException("timeout", "TimeoutError"); }) as typeof fetch), { code: "ai_timeout" });
  await assert.rejects(generateAssistance(messages, config, (async () => Response.json({ done: true, done_reason: "length", message: { content: "{}" } })) as typeof fetch), { code: "ai_invalid_response" });
});

test("replaces operator instructions with a customer-facing question", () => {
  for (const sugestao of [
    "Atendente, por favor, revise a mensagem para garantir a correta atribuição do contexto.",
    "Por favor, aguarde enquanto o atendente verifica a disponibilidade.",
    "Revise a resposta antes de enviar.",
  ]) {
    const result = parseAssistance(JSON.stringify({ resumo: "Teste", intencao: "Não identificada", sugestao }));
    assert.equal(result.sugestao, "Olá! Poderia nos contar como podemos ajudar?");
  }
});

test("preserves a response addressed directly to the customer", () => {
  const sugestao = "Boa tarde! Vou verificar a disponibilidade para você.";
  assert.equal(parseAssistance(JSON.stringify({ resumo: "Consulta", intencao: "Disponibilidade", sugestao })).sugestao, sugestao);
});
