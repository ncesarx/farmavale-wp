import assert from "node:assert/strict";
import test from "node:test";
import {
  getMetaMessageId,
  normalizeWhatsAppRecipient,
} from "./whatsapp";

test("normalizes a WhatsApp recipient to digits", () => {
  assert.equal(normalizeWhatsAppRecipient("+55 (12) 98164-6123"), "5512981646123");
});

test("extracts the message id returned by Meta", () => {
  assert.equal(
    getMetaMessageId({ messages: [{ id: "wamid.test" }] }),
    "wamid.test",
  );
  assert.equal(getMetaMessageId({ messages: [] }), null);
});
