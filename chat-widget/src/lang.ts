import type { Lang } from "../../worker/src/chat/protocol";

const ARABIC_WORD = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]+/g;
const LATIN_WORD = /[A-Za-zÀ-ɏ]+/g;

/**
 * The language a message is written in. Counted in words, not letters, so an Arabic question full of Latin tech
 * terms ("ما خبرته في LangGraph و vLLM؟") is Arabic, and an English one that names "حاتم" stays English.
 * No letters at all (emoji, numbers) → `fallback`.
 */
export function detectLang(text: string, fallback: Lang): Lang {
  const ar = text.match(ARABIC_WORD)?.length ?? 0;
  const latin = text.match(LATIN_WORD)?.length ?? 0;
  if (ar && ar >= latin) return "ar";
  if (latin) return "en";
  return fallback;
}

/**
 * Latin-script runs inside right-to-left text (tech terms, names, emails, URLs, phone numbers, dates) that must be
 * isolated as left-to-right islands, or the bidi algorithm reorders their neutral characters ("+20 114", "A100 GPUs,").
 * A run starts and ends on a letter/digit (or + #) and may contain spaces and common punctuation in between.
 * Parentheses stay outside the run: they then take the paragraph's direction and mirror correctly around it.
 */
export const LATIN_RUN = /[A-Za-z0-9À-ɏ+#@][\wÀ-ɏ+#@&'’.,:;/\-–% ]*[\wÀ-ɏ#+%]|[A-Za-z0-9À-ɏ]/g;
