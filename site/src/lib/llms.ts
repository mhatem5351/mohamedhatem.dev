/**
 * llms.txt (https://llmstxt.org): a concise, machine-readable summary of the site for AI crawlers and assistants,
 * plus llms-full.txt with every role, case study, credential and skill. Built from content/profile.ts only, in
 * English (the Arabic site is linked). Public facts only; the unnamed client stays unnamed.
 */
import { formatPeriod, localePath } from "./i18n";
import { CV_PDF, PATHS, absolute, caseStudies, contact, byLocale, link, profile } from "./site";

const en = "en" as const;
const b = profile.basics;
const url = (path: string): string => absolute(path);

function header(): string[] {
  return [
    `# ${b.name.en}`,
    "",
    `> ${b.headline.en}. ${b.tagline.en}`,
    "",
    b.intro.en,
    "",
    `Based in ${b.location.city.en}, ${b.location.country.en}; time zone ${b.location.utcOffset.en}. ${b.location.workStyle.en}`,
    `${b.openTo.line.en}`,
    "",
  ];
}

function experience(full: boolean): string[] {
  const out = ["## Experience", ""];
  for (const r of profile.experience) {
    const line = `- ${r.title.en}, ${r.company.en} (${formatPeriod(r.period, en)}; ${r.employmentType}${r.workMode ? `, ${r.workMode}` : ""}; ${r.location.en}): ${r.summary.en}`;
    out.push(line);
    if (full) for (const f of r.bullets) out.push(`  - ${f.text.en}`);
  }
  out.push("");
  return out;
}

function work(full: boolean): string[] {
  const out = ["## Case studies", ""];
  for (const c of caseStudies) {
    out.push(`- [${c.title.en}](${url(PATHS.work(c.slug))}): ${c.summary.en}`);
    if (full) {
      out.push(`  - Context: ${c.context.en}. My part: ${c.contribution.en}.`);
      out.push(`  - Problem: ${c.problem.en}`);
      for (const f of c.approach) out.push(`  - Approach: ${f.text.en}`);
      for (const f of c.outcome) out.push(`  - Outcome: ${f.text.en}`);
      out.push(`  - Stack: ${(c.stack as readonly (string | Record<"en" | "ar", string>)[]).map((t) => byLocale(t, "en")).join(", ")}`);
      for (const l of c.links) out.push(`  - ${l.label.en}: ${byLocale(l.href as string | Record<"en" | "ar", string>, "en")}`);
    }
  }
  out.push("");
  return out;
}

function openSource(full: boolean): string[] {
  const out = ["## Open source", ""];
  for (const p of profile.projects.filter((x) => full || x.featured)) {
    out.push(`- [${p.name}](${p.repo}): ${p.description.en}${p.live ? ` Live: ${byLocale(p.live as string | Record<"en" | "ar", string>, "en")}` : ""}`);
    if (full) for (const h of p.highlights) out.push(`  - ${h.text.en}`);
  }
  out.push("");
  return out;
}

function education(): string[] {
  const out = ["## Education and certifications", ""];
  for (const e of profile.education)
    out.push(`- ${e.degree.en}, ${e.institution.en} (${formatPeriod(e.period, en, { expected: e.status === "in-progress" })}${e.status === "in-progress" ? ", in progress" : ""})${e.notes ? `: ${e.notes.en}` : ""}`);
  for (const c of profile.certifications) out.push(`- ${c.name.en}, ${c.issuer.en}${c.issued ? ` (earned ${c.issued.slice(0, 4)})` : ""}`);
  for (const h of profile.honors) out.push(`- Award: ${h.title.en}, ${h.issuer.en}`);
  out.push("");
  return out;
}

function skills(): string[] {
  const out = ["## Skills", ""];
  // Listed-only skills (a CV line's optional `alsoUsed`, round 7 HM-17) follow the evidenced ones.
  for (const line of profile.cv.skills) {
    const also = (line as { alsoUsed?: readonly { en: string }[] }).alsoUsed;
    out.push(`- ${line.label.en}: ${line.items.map((i) => i.en).join(", ")}${also?.length ? `; also used: ${also.map((i) => i.en).join(", ")}` : ""}`);
  }
  out.push("");
  return out;
}

function contactLines(): string[] {
  return [
    "## Contact",
    "",
    `- Email: ${contact("email").display} (also ${contact("gmail").display})`,
    `- WhatsApp: ${contact("whatsapp").display} (${contact("whatsapp").href})`,
    `- LinkedIn: ${link("linkedin").href}`,
    `- GitHub: ${link("github").href}`,
    `- Contact form and AI assistant: ${url("/")}#contact`,
    "",
  ];
}

function optional(full: boolean): string[] {
  return [
    "## Optional",
    "",
    `- [CV (web page)](${url(PATHS.cv)}): the same facts as a printable CV`,
    `- [CV (PDF)](${url(CV_PDF.en)})`,
    `- [Arabic version of the site](${url(localePath("/", "ar"))}): the same content written in Arabic`,
    `- [Privacy](${url(PATHS.privacy)}): what the site, the assistant and the contact form process`,
    ...(full ? [] : [`- [Full details](${url("/llms-full.txt")}): every role, case study, credential and skill`]),
    `- [Source code of this site](${link("site-source").href})`,
    "",
  ];
}

export function llmsTxt(): string {
  return [...header(), ...experience(false), ...work(false), ...openSource(false), ...contactLines(), ...optional(false)].join("\n");
}

export function llmsFullTxt(): string {
  return [
    ...header(),
    "## About",
    "",
    ...b.bio.map((f) => f.text.en),
    "",
    ...experience(true),
    ...work(true),
    ...openSource(true),
    ...education(),
    ...skills(),
    `Languages: ${b.languages.map((l) => `${l.name.en} (${l.level.en})`).join(", ")}.`,
    "",
    ...contactLines(),
    ...optional(true),
  ].join("\n");
}
