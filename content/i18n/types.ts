/**
 * Shared i18n types and tiny helpers for content/i18n/{en,ar}.ts.
 *
 * - Placeholders use `{name}` and are filled with `format()`.
 * - Count-dependent strings are `Plural` objects keyed by CLDR plural category and resolved with `pluralize()`,
 *   which uses `Intl.PluralRules`. Arabic needs all six categories; English needs `one` and `other`.
 */

/** Strings for each CLDR plural category. `other` is required; the rest fall back to it. */
export interface Plural {
  /** Count 0 (Arabic). */
  readonly zero?: string;
  /** Count 1. */
  readonly one?: string;
  /** Count 2 (Arabic dual). */
  readonly two?: string;
  /** Arabic 3-10 (and 103-110, ...). */
  readonly few?: string;
  /** Arabic 11-99 (and 111-199, ...). */
  readonly many?: string;
  /** Everything else. */
  readonly other: string;
}

/** Declare a plural string (identity helper, so `as const` objects keep the `Plural` shape). */
export function plural(forms: Plural): Plural {
  return forms;
}

/** Turns every string literal in a deeply readonly object into `string`, keeping the shape. */
export type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : T extends object
      ? { readonly [K in keyof T]: Widen<T[K]> }
      : T;

/** Fill `{name}` placeholders. Unknown placeholders are left as they are, so a missing value is visible. */
export function format(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/**
 * Pick the right plural form for `count` in `locale` and fill `{count}` (plus any other values).
 * Digits are Western in both locales, so `count` is inserted as-is.
 */
export function pluralize(
  forms: Plural,
  count: number,
  locale: "en" | "ar",
  values: Readonly<Record<string, string | number>> = {},
): string {
  const category = new Intl.PluralRules(locale).select(count) as keyof Plural;
  const template = forms[category] ?? forms.other;
  return format(template, { count, ...values });
}
