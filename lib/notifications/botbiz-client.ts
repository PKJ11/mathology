import "server-only";

const ENDPOINT = "https://dash.botbiz.io/api/v1/whatsapp/send/template";

export type BotbizResult = { success: boolean; messageId: string | null; error: string | null };

export type BotbizTemplateMessage = {
  templateId: string;
  /** Country code + number, no "+", e.g. 919876543210 */
  phone: string;
  /** In template order: each becomes `templateVariable-<name>-<position>` */
  variables: { name: string; value: string }[];
};

function credentials() {
  const apiToken = process.env.BOTBIZ_API_TOKEN;
  const phoneNumberId = process.env.BOTBIZ_PHONE_NUMBER_ID;
  if (!apiToken || !phoneNumberId) throw new Error("BOTBIZ_API_TOKEN and BOTBIZ_PHONE_NUMBER_ID must be set");
  return { apiToken, phoneNumberId };
}

/** Sends one approved WhatsApp template through BotBiz. Throws only when credentials are missing. */
export async function sendBotbizTemplate(message: BotbizTemplateMessage): Promise<BotbizResult> {
  const { apiToken, phoneNumberId } = credentials();
  const body = new URLSearchParams({
    apiToken,
    phone_number_id: phoneNumberId,
    template_id: message.templateId,
    phone_number: message.phone,
  });
  message.variables.forEach((v, i) => body.append(`templateVariable-${v.name}-${i + 1}`, v.value));

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    let result: Record<string, unknown> = {};
    try {
      result = JSON.parse(text);
    } catch {
      // Non-JSON reply (e.g. an HTML error page): fall through with an empty result
    }
    const data = (result.data ?? {}) as Record<string, unknown>;
    const id = result.id ?? result.message_id ?? data.message_id;
    const messageId = id == null ? null : String(id);

    if (res.ok && (result.success === true || result.status === "success" || messageId)) {
      return { success: true, messageId, error: null };
    }
    const reason = result.message ?? result.error ?? (text.slice(0, 200) || res.statusText);
    return { success: false, messageId, error: `BotBiz ${res.status}: ${String(reason)}` };
  } catch (err) {
    return { success: false, messageId: null, error: err instanceof Error ? err.message : String(err) };
  }
}
