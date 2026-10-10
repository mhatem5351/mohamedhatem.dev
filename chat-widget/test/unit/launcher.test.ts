import { afterEach, describe, expect, it } from "vitest";
import { mountChat } from "../../src/index";
import { createPanel } from "../../src/panel";
import type { ChatLauncher, ChatWidgetConfig } from "../../src/types";

type W = Window & { MHChat?: { launcher: ChatLauncher } };

afterEach(() => {
  document.body.replaceChildren();
  delete (window as W).MHChat;
});

describe("launcher hook (window.MHChat.launcher)", () => {
  it("exposes the host, its open shadow root and the launcher button", () => {
    mountChat({ lang: "en" });
    const l = (window as W).MHChat!.launcher;
    expect(l.host).toBe(document.querySelector("[data-mh-chat]"));
    expect(l.root).toBe(l.host.shadowRoot);
    expect(l.button).toBe(l.root.querySelector("button.b"));
    expect(l.button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(l.host.dir).toBe("ltr");
  });

  it("is mirrored on Arabic pages (dir=rtl on the host)", () => {
    mountChat({ lang: "ar" });
    expect((window as W).MHChat!.launcher.host.dir).toBe("rtl");
  });
});

describe("panel header avatar (ChatWidgetConfig.avatar)", () => {
  const panelWith = (config: ChatWidgetConfig) => {
    const host = document.body.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    const bubble = root.appendChild(document.createElement("button"));
    createPanel({ host, root, bubble, config, lang: "en", key: "t", addStyles: () => {} });
    return root.querySelector(".avw")!.firstElementChild!;
  };

  it("uses the element the factory returns", () => {
    const art = document.createElement("span");
    art.className = "av avh";
    expect(panelWith({ avatar: () => art, avatarSrc: "/photo.webp" })).toBe(art);
  });

  it("falls back to avatarSrc, then to the monogram, when the factory returns nothing", () => {
    const img = panelWith({ avatar: () => undefined, avatarSrc: "/photo.webp" });
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("/photo.webp");
    document.body.replaceChildren();
    expect(panelWith({ avatar: () => null }).textContent).toBe("MH");
  });
});
