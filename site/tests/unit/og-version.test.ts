/** Share-card URLs (src/lib/og-version.ts): the case-study Article gets its card in 16:9, 4:3 and 1:1 (audit SEO-05). */
import { describe, expect, it } from "vitest";
import { cardRatio, withCardRatios } from "~/lib/og-version";

const CARD = "https://mohamedhatem.dev/og/work-sta-tourism-assistants-ar.png?v=1a2b3c4d";

describe("case-study card ratios", () => {
  it("names the 4:3 and 1:1 files after the card, with the card's own version", () => {
    expect(cardRatio(CARD, "4x3")).toBe("https://mohamedhatem.dev/og/work-sta-tourism-assistants-ar-4x3.jpg?v=1a2b3c4d");
    expect(cardRatio("/og/work-x-en.png", "1x1")).toBe("/og/work-x-en-1x1.jpg");
  });

  it("gives the page's Article all three, in Google's order, and leaves every other node alone", () => {
    const article = { "@type": "Article", headline: "x", image: CARD };
    expect(withCardRatios(article, CARD).image).toEqual([CARD, cardRatio(CARD, "4x3"), cardRatio(CARD, "1x1")]);
    expect(article.image).toBe(CARD); // not mutated
    const person = { "@type": "Person", image: CARD };
    expect(withCardRatios(person, CARD)).toBe(person);
    const other = { "@type": "Article", image: "https://mohamedhatem.dev/og/home-en.png?v=1" };
    expect(withCardRatios(other, other.image)).toBe(other); // only case-study cards have the other ratios
    expect(withCardRatios({ "@type": "Article", image: "https://example.com/x.png" }, CARD).image).toBe("https://example.com/x.png");
  });
});
