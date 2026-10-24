export const ADE_ACTIVE_STAGES = ["NAME", "REASON"] as const;
export type AdeStage = "OFF" | "NAME" | "REASON" | "HUMAN";
export type AdeDecision = { stage: AdeStage; name: string | null; reason: string | null; reply: string };

function plain(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
export function adeMessageIsRecent(timestamp: Date, now = Date.now()) {
  const age = now - timestamp.getTime();
  return Number.isFinite(age) && age >= -5 * 60_000 && age < 23 * 60 * 60_000;
}
export function isAdeActive(stage: string) {
  return (ADE_ACTIVE_STAGES as readonly string[]).includes(stage);
}
export function adeEligible(config: {
  enabled: string | undefined; channelId: string; configuredChannelId: string | undefined;
  phone: string; allowlist: string | undefined;
}) {
  if (config.enabled !== "true" || !config.configuredChannelId || config.channelId !== config.configuredChannelId) return false;
  if (config.allowlist?.trim() === "*") return true;
  const allowed = (config.allowlist ?? "").split(",").map(value => value.replace(/\D/g, "")).filter(Boolean);
  return allowed.includes(config.phone.replace(/\D/g, ""));
}
function cleanName(value: string) {
  const name = value.trim().replace(/[.!]+$/, "").trim();
  const words = name.split(/\s+/);
  if (!name || name.length > 50 || words.length > 4 || !words.every(word => /^[\p{L}][\p{L}'’-]*$/u.test(word))) return null;
  if (/\b(oi|ola|bom|boa|dia|tarde|noite|obrigad[oa]|quero|preciso|comprar|remedio|medicamento|preco|sim|nao|tudo|bem|teste|aguarde|wait|ignore|instrucoes|atendente|humano|ajuda|ajudar|receita|entrega|pix|pagamento|estou|tenho|dor|mal|sintoma|nome|prefiro|informar)\b/.test(plain(name))) return null;
  return name;
}
export function extractAdeName(text: string, acceptBare = false) {
  const match = text.match(/(?:^|\b)(?:meu nome [ée]|me chamo|pode me chamar de|sou (?:o |a )?)\s*([\p{L}'’ -]{1,60})(?=[,;.!?\n]|$)/iu);
  return match ? cleanName(match[1]) : acceptBare ? cleanName(text) : null;
}
function greetingOnly(text: string) {
  return /^(?:(?:oi+|ola+|bom dia|boa tarde|boa noite|tudo bem|obrigad[oa]|ok|teste|test|this is a text message|teste interno de atribuicao automatica|wait|farmavale)[\s!?.💚,]*)+$/u.test(plain(text));
}
function humanRequested(text: string) {
  return /\b(atendente|humano|humana|pessoa|farmaceutico|farmaceutica|falar com alguem)\b/.test(plain(text));
}
function reasonText(text: string, name: string | null) {
  let value = text.trim().replace(/^(?:oi|olá|bom dia|boa tarde|boa noite)[,!\s]+/iu, "");
  if (name) {
    value = value.replace(/^(?:meu nome [ée]|me chamo|pode me chamar de|sou (?:o |a )?)\s*[^,;.!?\n]+[,;.!?\n]?\s*/iu, "");
    if (plain(value) === plain(name)) value = "";
  }
  if (!value || greetingOnly(value)) return null;
  return value.slice(0, 600);
}
function reasonLabel(reason: string) {
  const value = plain(reason);
  if (/\b(preco|valor|custa|orcamento)\b/.test(value)) return "Você quer consultar um preço";
  if (/\b(entrega|entregar|pedido)\b/.test(value)) return "Você precisa de ajuda com um pedido ou uma entrega";
  if (/\b(pagamento|pix|cobranca|cartao|estorno)\b/.test(value)) return "Você precisa de ajuda com uma questão de pagamento";
  if (/\b(dor|saude|sintoma|passando mal)\b/.test(value)) return "Você precisa conversar sobre uma questão de saúde";
  if (/\b(medicamento|remedio|receita|protetor|produto)\b/.test(value)) return "Você quer informações sobre um medicamento ou produto";
  return "Você gostaria de ajuda da nossa equipe";
}
export function decideAdeWelcome(input: {
  stage: AdeStage; name: string | null; body: string | null; mediaType: string | null; turns: number;
}): AdeDecision {
  const text = input.body?.trim() ?? "";
  const name = extractAdeName(text, input.stage === "NAME") ?? input.name;
  const prefix = name ? "Entendi, " + name + "!" : "Entendi!";
  const intro = input.stage === "OFF" ? "Olá! Que bom receber você na Farmavale 💚 Sou a Ade, assistente virtual da nossa equipe. " : "";
  const media = Boolean(input.mediaType && input.mediaType !== "text");
  const declinedName = /(?:prefiro|quero|vou).*(?:n[aã]o|sem).*(?:nome|informar)|n[aã]o (?:quero|vou|prefiro) (?:informar|dizer)|sem nome/i.test(text);
  const reason = declinedName ? null : media ? "Cliente enviou " + input.mediaType + "; conteúdo precisa ser conferido pela equipe." : reasonText(text, name);
  if (media || humanRequested(text) || reason || input.turns >= 2) {
    const summary = media ? "Recebi sua mensagem" : reason ? reasonLabel(reason) : "Vou encaminhar seu contato";
    return {
      stage: "HUMAN", name,
      reason: reason ?? (humanRequested(text) ? "Cliente pediu atendimento humano." : "Motivo ainda não informado."),
      reply: intro + prefix + " " + summary + ". Sua solicitação ficará na fila da nossa equipe para uma pessoa continuar o atendimento com você. 💚",
    };
  }
  if (declinedName || name || input.stage === "REASON" || (input.stage === "NAME" && text)) {
    return {
      stage: "REASON", name, reason: null,
      reply: intro + (name ? "Prazer, " + name + "!" : "Tudo bem, podemos continuar sem o nome.") + " Me conta: como podemos ajudar você hoje?",
    };
  }
  return { stage: "NAME", name: null, reason: null, reply: intro + "Qual é o seu nome e como você prefere que eu te chame?" };
}
