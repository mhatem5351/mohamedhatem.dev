/**
 * Contact form behaviour (ContactForm.astro): lazy Turnstile, validation with an error summary, POST /api/contact,
 * the server's answers (200, 422, 403 turnstile_failed, 429, 5xx, network) and the success state.
 * A 429 or 5xx that isn't the Worker's JSON (Cloudflare answering for it, e.g. once the free plan's daily request
 * limit is reached, or an edge rule) means the form can't work right now: the status says so and offers email and
 * WhatsApp, instead of a misleading "wait a minute".
 */
import { contactPayload, serverFieldErrors, validateContact, type ContactValues, type Field, type FieldError } from "~/lib/contact-form";

interface Turnstile {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
}
type TurnstileWindow = Window & { turnstile?: Turnstile };
type Plural = Partial<Record<"zero" | "one" | "two" | "few" | "many", string>> & { other: string };
interface Strings {
  errors: Record<FieldError["key"], string>;
  summary: Plural;
  turnstile: string;
  rateLimited: string;
  server: string;
  unavailable: string;
  network: string;
  sending: string;
  submit: string;
  successBody: string;
  successRef: string;
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const FIELDS: Field[] = ["name", "email", "company", "subject", "message"];

const fill = (template: string, values: Record<string, string | number> = {}): string =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (values[k] === undefined ? m : String(values[k])));

export function initContactForm(): void {
  const form = document.querySelector<HTMLFormElement>("[data-contact-form]");
  const dataEl = document.querySelector<HTMLScriptElement>("script[data-contact-i18n]");
  if (!form || !dataEl) return;
  const t = JSON.parse(dataEl.textContent || "{}") as Strings;
  const lang: "en" | "ar" = form.dataset.lang === "ar" ? "ar" : "en";
  const card = form.parentElement!;
  const slot = form.querySelector<HTMLElement>("[data-turnstile-slot]")!;
  const summary = form.querySelector<HTMLElement>("[data-summary]")!;
  const status = form.querySelector<HTMLElement>("[data-status]")!;
  const statusLinks = status.querySelector<HTMLElement>("[data-status-links]")!;
  const submit = form.querySelector<HTMLButtonElement>("[data-submit]")!;
  const success = card.querySelector<HTMLElement>("[data-success]")!;
  const input = (f: Field) => form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#cf-${f}`)!;

  let token = "";
  let widgetId: string | undefined;
  let widgetFailed = false;
  let loading: Promise<void> | undefined;
  let submitted = false;
  let busy = false;

  /* ---------------------------------------------------------------- Turnstile (lazy) */
  const render = (): void => {
    const ts = (window as TurnstileWindow).turnstile;
    if (!ts || widgetId !== undefined) return;
    widgetId = ts.render(slot, {
      sitekey: form.dataset.sitekey,
      action: "contact",
      theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      size: "flexible",
      language: lang,
      callback: (v: string) => {
        token = v;
        widgetFailed = false;
      },
      "expired-callback": () => (token = ""),
      "error-callback": () => {
        token = "";
        widgetFailed = true;
      },
    });
    slot.dataset.ready = "";
  };
  const loadTurnstile = (): Promise<void> =>
    (loading ??= new Promise<void>((ok, fail) => {
      if ((window as TurnstileWindow).turnstile) return ok();
      const s = document.createElement("script");
      s.src = TURNSTILE_SRC;
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => {
        loading = undefined;
        fail(new Error("turnstile"));
      };
      document.head.append(s);
    }).then(render));
  const resetTurnstile = (): void => {
    token = "";
    if (widgetId !== undefined) (window as TurnstileWindow).turnstile?.reset(widgetId);
  };
  const waitForToken = (ms: number): Promise<string> =>
    new Promise((ok) => {
      const t0 = Date.now();
      const tick = () => {
        if (token || widgetFailed || Date.now() - t0 > ms) ok(token);
        else setTimeout(tick, 200);
      };
      tick();
    });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          loadTurnstile().catch(() => {});
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(form);
  }
  form.addEventListener("focusin", () => void loadTurnstile().catch(() => {}), { once: true });

  /* ---------------------------------------------------------------- validation UI */
  const values = (): ContactValues => ({
    name: input("name").value,
    email: input("email").value,
    company: input("company").value,
    subject: input("subject").value,
    message: input("message").value,
  });

  const plural = (count: number): string => {
    const cat = new Intl.PluralRules(lang).select(count) as keyof Plural;
    return fill(t.summary[cat] ?? t.summary.other, { count });
  };

  function setFieldError(f: Field, err: FieldError | undefined): void {
    const el = input(f);
    const box = form!.querySelector<HTMLElement>(`#cf-${f}-err`)!;
    const text = box.querySelector<HTMLElement>("[data-error-text]")!;
    if (err) {
      el.setAttribute("aria-invalid", "true");
      text.textContent = fill(t.errors[err.key], err.values);
      box.hidden = false;
    } else {
      el.removeAttribute("aria-invalid");
      text.textContent = "";
      box.hidden = true;
    }
  }

  function showErrors(errors: FieldError[], focusSummary: boolean): void {
    for (const f of FIELDS) setFieldError(f, errors.find((e) => e.field === f));
    const list = summary.querySelector<HTMLElement>("[data-summary-list]")!;
    list.replaceChildren();
    if (!errors.length) {
      summary.hidden = true;
      return;
    }
    summary.querySelector<HTMLElement>("[data-summary-title]")!.textContent = plural(errors.length);
    for (const e of errors) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = `#cf-${e.field}`;
      a.textContent = fill(t.errors[e.key], e.values);
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        input(e.field).focus();
      });
      li.append(a);
      list.append(li);
    }
    summary.hidden = false;
    if (focusSummary) summary.focus();
  }

  /** Shows (or clears) the status message; `channels` adds the email and WhatsApp links under it. */
  function setStatus(text: string, channels = false): void {
    status.querySelector<HTMLElement>("[data-status-text]")!.textContent = text;
    statusLinks.hidden = !(text && channels);
    status.classList.toggle("is-on", !!text);
  }

  function setBusy(on: boolean): void {
    busy = on;
    form!.setAttribute("aria-busy", String(on));
    submit.setAttribute("aria-disabled", String(on));
    submit.querySelector<HTMLElement>("[data-submit-label]")!.textContent = on ? t.sending : t.submit;
  }

  // After the first submit, re-check on blur (and clear a fixed error as soon as it's fixed).
  form.addEventListener("focusout", (e) => {
    if (!submitted || !(e.target as Element).closest?.("input, select, textarea")) return;
    showErrors(validateContact(values()), false);
  });
  form.addEventListener("input", (e) => {
    const el = e.target as HTMLElement;
    if (!submitted || el.getAttribute("aria-invalid") !== "true") return;
    const f = el.id.replace(/^cf-/, "") as Field;
    if (!validateContact(values()).some((x) => x.field === f)) setFieldError(f, undefined);
  });

  /* ---------------------------------------------------------------- submit */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    submitted = true;
    setStatus("");
    const v = values();
    const errors = validateContact(v);
    showErrors(errors, true);
    if (errors.length) return;

    setBusy(true);
    try {
      if (!token) {
        await loadTurnstile().catch(() => {});
        await waitForToken(12_000);
      }
      if (!token) {
        setStatus(t.turnstile);
        return;
      }
      const honeypot = (form.elements.namedItem("mh_hp") as HTMLInputElement | null)?.value ?? "";
      let res: Response;
      try {
        res = await fetch("/api/contact", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(contactPayload(v, { turnstileToken: token, honeypot, lang })),
        });
      } catch {
        setStatus(t.network);
        return;
      }
      // A token is single-use: get a fresh one for any retry.
      resetTurnstile();
      if (res.ok) {
        const ok = (await res.json().catch(() => ({}))) as { ref?: string };
        showSuccess(v, typeof ok.ref === "string" ? ok.ref : "");
        return;
      }
      const isJson = /\bjson\b/i.test(res.headers.get("content-type") ?? "");
      const body = (isJson ? await res.json().catch(() => null) : null) as { error?: string; fields?: string[] } | null;
      const fields = Array.isArray(body?.fields) ? body.fields : undefined;
      if (!body && (res.status === 429 || res.status >= 500)) setStatus(t.unavailable, true);
      else if (res.status === 422 && fields?.length) showErrors(serverFieldErrors(fields), true);
      else if (res.status === 403 && body?.error === "turnstile_failed") setStatus(t.turnstile);
      else if (res.status === 429) setStatus(t.rateLimited);
      else setStatus(t.server, true);
    } finally {
      setBusy(false);
    }
  });

  /* ---------------------------------------------------------------- success */
  function showSuccess(v: ContactValues, ref: string): void {
    success.querySelector<HTMLElement>("[data-success-body]")!.textContent = fill(t.successBody, {
      name: v.name.trim(),
      email: v.email.trim(),
    });
    const refEl = success.querySelector<HTMLElement>("[data-success-ref]")!;
    refEl.hidden = !ref;
    refEl.textContent = ref ? fill(t.successRef, { ref }) : "";
    form!.hidden = true;
    success.hidden = false;
    success.querySelector<HTMLElement>("[data-success-title]")!.focus();
  }
  success.querySelector<HTMLButtonElement>("[data-again]")!.addEventListener("click", () => {
    form.reset();
    submitted = false;
    showErrors([], false);
    setStatus("");
    success.hidden = true;
    form.hidden = false;
    input("name").focus();
  });
}
