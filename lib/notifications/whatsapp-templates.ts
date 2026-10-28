import "server-only";

export type WhatsAppTemplate = {
  /** BotBiz template id (not the template name) */
  templateId: string | undefined;
  /** Variable names in the order they appear in the approved BotBiz template */
  variables: readonly string[];
  /** Internal numbers that get a copy of every message */
  ccPhoneNumbers: string[];
};

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const WHATSAPP_TEMPLATES = {
  // "Dear #!name!#, … your demo class booking for #!date!# at #!time!# is confirmed."
  DEMO_CLASS_CONFIRMATION: {
    templateId: process.env.BOTBIZ_TEMPLATE_DEMO_CONFIRMATION,
    variables: ["name", "date", "time"],
    ccPhoneNumbers: list(process.env.WHATSAPP_DEMO_CC_NUMBERS),
  },
} satisfies Record<string, WhatsAppTemplate>;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES;
