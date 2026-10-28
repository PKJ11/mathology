import "server-only";
import { sendBotbizTemplate, type BotbizResult } from "./botbiz-client";
import { WHATSAPP_TEMPLATES, type WhatsAppTemplateKey } from "./whatsapp-templates";

/** Indian numbers in any common form (10-digit, 0-, 91- or +91-prefixed) → 91XXXXXXXXXX, else null. */
export function normalizeIndianPhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return /^[6-9]\d{9}$/.test(digits) ? `91${digits}` : null;
}

const fail = (error: string): BotbizResult => ({ success: false, messageId: null, error });

/**
 * Sends a registered template to `phone`, plus an internal copy to the template's CC numbers.
 * Never throws: the result says whether the customer's message went out. CC failures are only logged.
 */
export async function sendWhatsAppTemplate(
  key: WhatsAppTemplateKey,
  phone: string,
  values: Record<string, string>,
): Promise<BotbizResult> {
  const template = WHATSAPP_TEMPLATES[key];
  if (!template.templateId) return fail(`No BotBiz template id configured for ${key}`);

  const to = normalizeIndianPhone(phone);
  if (!to) return fail(`Not an Indian mobile number: ${phone}`);

  const missing = template.variables.filter((name) => !values[name]?.trim());
  if (missing.length) return fail(`Missing template variables for ${key}: ${missing.join(", ")}`);
  const variables = template.variables.map((name) => ({ name, value: values[name].trim() }));

  const send = async (number: string) => {
    try {
      return await sendBotbizTemplate({ templateId: template.templateId!, phone: number, variables });
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  };

  const cc = template.ccPhoneNumbers.map(normalizeIndianPhone).filter((n): n is string => !!n && n !== to);
  const [result, ...ccResults] = await Promise.all([send(to), ...cc.map(send)]);
  ccResults.forEach((r, i) => {
    if (!r.success) console.warn(`[whatsapp] ${key} copy to ${cc[i]} failed: ${r.error}`);
  });
  return result;
}
