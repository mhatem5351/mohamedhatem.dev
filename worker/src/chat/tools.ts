import { sanitizeText } from "./parse";
import { SECTION_IDS, type SectionId, type ToolEvent } from "./protocol";

/**
 * UI tools: the model asks for them in its closing `<ui>{…}</ui>` directive (directive.ts), the Worker validates
 * the arguments here and forwards them to the widget as `event: tool`, and the widget renders them (contact card,
 * jump link, follow-up chips). Nothing runs server-side and nothing flows back to the model, so a hostile or
 * malformed request can at worst render a harmless card. Contact details always come from the widget's config,
 * never from the model.
 */
const REASONS = ["hiring", "project", "general"] as const;

/** A validated, normalised tool event, or null for unknown tools / unusable arguments. */
export function validateToolCall(name: unknown, args: unknown): ToolEvent | null {
  const a = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  switch (name) {
    case "show_contact_card": {
      const reason = REASONS.includes(a.reason as (typeof REASONS)[number]) ? (a.reason as (typeof REASONS)[number]) : "general";
      return { name, args: { reason } };
    }
    case "open_section": {
      const id = typeof a.id === "string" ? a.id.trim().toLowerCase().replace(/^#/, "") : "";
      return (SECTION_IDS as readonly string[]).includes(id) ? { name, args: { id: id as SectionId } } : null;
    }
    case "suggest_followups": {
      if (!Array.isArray(a.questions)) return null;
      const seen = new Set<string>();
      const questions: string[] = [];
      for (const q of a.questions) {
        if (typeof q !== "string") continue;
        // One line of plain text: no markdown, links or HTML-ish brackets in a chip.
        const text = sanitizeText(q).replace(/\s+/g, " ").replace(/[*_`#<>[\]]/g, "").trim();
        if (text.length < 3 || text.length > 120 || seen.has(text.toLowerCase())) continue;
        seen.add(text.toLowerCase());
        questions.push(text);
        if (questions.length === 3) break;
      }
      return questions.length ? { name, args: { questions } } : null;
    }
    default:
      return null;
  }
}
