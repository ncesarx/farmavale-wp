import assert from "node:assert/strict";
import test from "node:test";
import { applyReplyVariables, normalizeShortcut } from "./quick-reply";

test("normalizes quick reply shortcuts", () => {
  assert.equal(normalizeShortcut(" /Pedido Recebido "), "/pedido-recebido");
  assert.equal(normalizeShortcut("///status_pedido"), "/status_pedido");
});

test("replaces supported reply variables", () => {
  assert.equal(applyReplyVariables("Olá {{cliente}}, protocolo {{protocolo}}.", { customerName: "Ana", protocol: "FV-1" }), "Olá Ana, protocolo FV-1.");
});
