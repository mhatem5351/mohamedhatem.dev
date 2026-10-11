# Security policy

This repository is the source of [mohamedhatem.dev](https://mohamedhatem.dev): a static site and one Cloudflare Worker
that answers `/api/*` (the chat assistant, the contact form and CSP reports). Only the live site and the `main` branch
are supported.

## Reporting a vulnerability

Please report privately, never in a public issue or pull request:

- **Email:** [hatem@mohamedhatem.dev](mailto:hatem@mohamedhatem.dev), in English or Arabic (the same contact as
  [`/.well-known/security.txt`](https://mohamedhatem.dev/.well-known/security.txt)).
- **GitHub:** Security → **Report a vulnerability** on this repository (a private advisory).

Include the URL or file, the steps to reproduce and what an attacker gains. You'll get a reply within 5 working days.
Confirmed issues are fixed as soon as practical, and I'll tell you when the fix is live. With your permission, I'll
credit you in the fix's commit. This is a personal site: there is no bug bounty.

## Scope

In scope:

- mohamedhatem.dev and its pages: content injection, broken security headers or CSP, open redirects;
- the API: `/api/chat`, `/api/contact`, `/api/csp-report`, `/api/health` (authentication, rate limits, input handling,
  email header injection);
- the chat assistant making it reveal its instructions or anything the site deliberately keeps confidential, or
  making it link to other sites;
- secrets or personal data in this repository or in the built site.

Out of scope:

- denial of service, load tests or automated scanners against `/api/*`: every request spends the free quotas that keep
  the assistant and the contact form running;
- the assistant only saying something odd, wrong or off-topic, without any of the effects above;
- spam through the contact form, social engineering, physical attacks;
- Cloudflare, Google (Gemini) and GitHub themselves: please report those to them.

Good-faith research that follows this policy is welcome: test by hand with a few requests, use only your own data,
and stop and report once you have shown the issue.
