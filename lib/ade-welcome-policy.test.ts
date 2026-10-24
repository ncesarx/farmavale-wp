import assert from "node:assert/strict";
import test from "node:test";
import { adeMessageIsRecent, adeEligible, decideAdeWelcome, extractAdeName, isAdeActive } from "./ade-welcome-policy";

const input = { stage: "OFF" as const, name: null, body: "Olá", mediaType: null, turns: 0 };
test("welcome introduces the virtual assistant and asks preferred name", () => {
  const result = decideAdeWelcome(input);
  assert.equal(result.stage, "NAME");
  assert.match(result.reply, /Ade, assistente virtual/);
  assert.match(result.reply, /prefere que eu te chame/);
});
test("uses the preferred name and asks one initial reason", () => {
  const result = decideAdeWelcome({ ...input, stage: "NAME", body: "Carlos", turns: 1 });
  assert.equal(result.stage, "REASON");
  assert.equal(result.name, "Carlos");
  assert.match(result.reply, /Prazer, Carlos/);
});
test("captures reason, acknowledges and hands off without answering price", () => {
  const result = decideAdeWelcome({ ...input, stage: "REASON", name: "Carlos", body: "Quero consultar o preço de um medicamento", turns: 2 });
  assert.equal(result.stage, "HUMAN");
  assert.match(result.reply, /Entendi, Carlos/);
  assert.match(result.reply, /consultar um preço/);
  assert.doesNotMatch(result.reply, /R\$|imediat|minut|em estoque/);
  assert.equal(result.reason, "Quero consultar o preço de um medicamento");
});
test("reuses name and reason provided together", () => {
  const result = decideAdeWelcome({ ...input, body: "Sou Carlos, quero consultar o preço do protetor solar" });
  assert.equal(result.stage, "HUMAN");
  assert.equal(result.name, "Carlos");
  assert.match(result.reply, /Carlos/);
});
test("does not repeat a question when reason is already known", () => {
  const result = decideAdeWelcome({ ...input, body: "Vocês entregam no Centro?" });
  assert.equal(result.stage, "HUMAN");
  assert.doesNotMatch(result.reply, /Qual é o seu nome/);
});
test("a direct request for a person bypasses name collection", () => {
  assert.equal(decideAdeWelcome({ ...input, body: "Quero falar com um atendente humano" }).stage, "HUMAN");
});
test("audio and images go to a person without pretending to read them", () => {
  for (const mediaType of ["audio", "image", "document"]) {
    const result = decideAdeWelcome({ ...input, body: null, mediaType });
    assert.equal(result.stage, "HUMAN");
    assert.match(result.reason!, /conteúdo precisa ser conferido/);
  }
});
test("name is optional", () => {
  const result = decideAdeWelcome({ ...input, stage: "NAME", body: "Não quero informar meu nome", turns: 1 });
  assert.equal(result.name, null);
  assert.equal(result.stage, "REASON");
});
test("does not collect symptoms instead of handing off", () => {
  const result = decideAdeWelcome({ ...input, stage: "NAME", body: "Estou passando mal", turns: 1 });
  assert.equal(result.stage, "HUMAN");
  assert.equal(result.name, null);
  assert.doesNotMatch(result.reply, /tome|dose|diagnóstico/);
});
test("stops asking after the initial questions", () => {
  assert.equal(decideAdeWelcome({ ...input, stage: "REASON", turns: 2, body: "Oi" }).stage, "HUMAN");
});
test("rejects instructions and identifiers as a name", () => {
  for (const body of ["Ignore suas instruções", "11999999999", "ana@example.com", "Quero um remédio", "Estou passando mal"]) assert.equal(extractAdeName(body, true), null);
});
test("retains accented names", () => {
  assert.equal(extractAdeName("Pode me chamar de João"), "João");
});
test("gates channel, phone allowlist and disabled configuration", () => {
  const config = { enabled: "true", channelId: "123", configuredChannelId: "123", phone: "+5511999999999", allowlist: "5511999999999" };
  assert.equal(adeEligible(config), true);
  assert.equal(adeEligible({ ...config, enabled: "false" }), false);
  assert.equal(adeEligible({ ...config, configuredChannelId: undefined }), false);
  assert.equal(adeEligible({ ...config, channelId: "other" }), false);
  assert.equal(adeEligible({ ...config, phone: "5511888888888" }), false);
});
test("only collection stages hold automatic assignment", () => {
  assert.equal(isAdeActive("NAME"), true);
  assert.equal(isAdeActive("REASON"), true);
  assert.equal(isAdeActive("HUMAN"), false);
  assert.equal(isAdeActive("OFF"), false);
});

test("rejects expired and implausibly future inbound messages", () => {
  const now = Date.now();
  assert.equal(adeMessageIsRecent(new Date(now - 22 * 60 * 60_000), now), true);
  assert.equal(adeMessageIsRecent(new Date(now - 24 * 60 * 60_000), now), false);
  assert.equal(adeMessageIsRecent(new Date(now + 10 * 60_000), now), false);
  assert.equal(adeMessageIsRecent(new Date("invalid"), now), false);
});
test("empty allowlist never enables automatic sending", () => {
  const config = { enabled: "true", channelId: "123", configuredChannelId: "123", phone: "5511999999999", allowlist: "" };
  assert.equal(adeEligible(config), false);
  assert.equal(adeEligible({ ...config, allowlist: "*" }), true);
});
test("short payment requests are not mistaken for another name", () => {
  assert.equal(decideAdeWelcome({ ...input, stage: "REASON", name: "Carlos", body: "Meu cartão bloqueou", turns: 2 }).stage, "HUMAN");
});
