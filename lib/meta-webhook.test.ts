import assert from "node:assert/strict";
import test from "node:test";
import { parseMetaWebhook } from "@/lib/meta-webhook";

test("parses inbound text messages and contact data", () => {
  const result = parseMetaWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                display_phone_number: "15556771807",
                phone_number_id: "phone-1",
              },
              contacts: [{ wa_id: "5511999999999", profile: { name: "Cliente Teste" } }],
              messages: [
                {
                  from: "5511999999999",
                  id: "wamid.abc",
                  timestamp: "1788895760",
                  type: "text",
                  text: { body: "Olá Farmavale" },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].id, "wamid.abc");
  assert.equal(result.messages[0].body, "Olá Farmavale");
  assert.equal(result.messages[0].contactName, "Cliente Teste");
  assert.equal(result.messages[0].phoneNumberId, "phone-1");
  assert.equal(result.statuses.length, 0);
});

test("parses delivery status updates", () => {
  const result = parseMetaWebhook({
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              statuses: [
                {
                  id: "wamid.outbound",
                  status: "delivered",
                  timestamp: "1788895760",
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.messages.length, 0);
  assert.equal(result.statuses.length, 1);
  assert.equal(result.statuses[0].id, "wamid.outbound");
  assert.equal(result.statuses[0].status, "delivered");
});

test("ignores malformed and unrelated payloads", () => {
  assert.deepEqual(parseMetaWebhook(null), { messages: [], statuses: [] });
  assert.deepEqual(parseMetaWebhook({ entry: [{ changes: [{ field: "other" }] }] }), {
    messages: [],
    statuses: [],
  });
});
