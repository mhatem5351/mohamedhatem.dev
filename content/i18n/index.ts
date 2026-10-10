/**
 * Entry point for site copy: `getMessages(locale)` plus the formatting helpers.
 *
 *   import { getMessages, format, pluralize } from "../content/i18n";
 *   const m = getMessages("ar");
 *   format(m.contact.success.body, { name, email });
 *   pluralize(m.skills.endorsements, 17, "ar");
 */
import { en, type Messages } from "./en";
import { ar } from "./ar";

export type { Messages } from "./en";
export { format, plural, pluralize, type Plural } from "./types";

/** Site locales, default first. */
export type Locale = "en" | "ar";

/** All messages by locale. */
export const messages: Readonly<Record<Locale, Messages>> = { en, ar };

/** Messages for one locale. */
export function getMessages(locale: Locale): Messages {
  return messages[locale];
}
