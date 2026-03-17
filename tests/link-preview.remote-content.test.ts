import { describe, expect, it, vi } from "vitest";
import { fetchWithRemoteContent } from "../packages/core/src/content/link-preview/content/fetcher.js";
import { buildResultFromRemoteContent } from "../packages/core/src/content/link-preview/content/remote-content.js";

describe("link preview remote content seam", () => {
  it("returns provider-neutral diagnostics and forwards options for Exa", async () => {
    const scrape = vi.fn(async () => ({
      provider: "exa",
      url: "https://example.com/article",
      title: "Exa title",
      content: "Hello from Exa",
      html: null,
      metadata: { author: "Ada" },
    }));

    const result = await fetchWithRemoteContent(
      "https://example.com/article",
      {
        provider: "exa",
        scrape,
      },
      {
        timeoutMs: 3210,
        cacheMode: "bypass",
        reason: "HTML looked blocked",
        maxCharacters: 9876,
      },
    );

    expect(scrape).toHaveBeenCalledWith("https://example.com/article", {
      timeoutMs: 3210,
      cacheMode: "bypass",
      maxCharacters: 9876,
    });
    expect(result.payload).toEqual({
      provider: "exa",
      url: "https://example.com/article",
      title: "Exa title",
      content: "Hello from Exa",
      html: null,
      metadata: { author: "Ada" },
    });
    expect(result.diagnostics).toEqual({
      provider: "exa",
      attempted: true,
      used: false,
      cacheMode: "bypass",
      cacheStatus: "bypassed",
      notes: "HTML looked blocked",
    });
  });

  it("records provider-specific diagnostics when Exa is not configured", async () => {
    const result = await fetchWithRemoteContent(
      "https://example.com/article",
      {
        provider: "exa",
        scrape: null,
      },
      {
        cacheMode: "default",
      },
    );

    expect(result.payload).toBeNull();
    expect(result.diagnostics).toEqual({
      provider: "exa",
      attempted: false,
      used: false,
      cacheMode: "default",
      cacheStatus: "unknown",
      notes: "Exa is not configured",
    });
  });

  it("promotes a real article heading over a generic remote-content title", async () => {
    const result = await buildResultFromRemoteContent({
      url: "https://example.com/article",
      payload: {
        provider: "exa",
        url: "https://example.com/article",
        title: "Human well‐being and per capita energy use - Jackson - 2022 - Ecosphere - Wiley Online Library",
        content: [
          "Close this dialog",
          "# Journal list menu",
          "Login / Register",
          "# Human well-being and per capita energy use",
          "Robert B. Jackson",
          "## Abstract",
          "Increased wealth and per capita energy use have transformed lives and shaped societies.",
        ].join("\n"),
        html: null,
        metadata: null,
      },
      cacheMode: "default",
      maxCharacters: null,
      firecrawlDiagnostics: {
        attempted: false,
        used: false,
        cacheMode: "default",
        cacheStatus: "unknown",
        notes: null,
      },
      remoteContentDiagnostics: {
        provider: "exa",
        attempted: true,
        used: false,
        cacheMode: "default",
        cacheStatus: "unknown",
        notes: "HTML fetch failed; falling back to Exa",
      },
      markdownRequested: false,
      _deps: {} as never,
    });

    expect(result?.title).toBe("Human well-being and per capita energy use");
    expect(result?.content.startsWith("# Human well-being and per capita energy use")).toBe(true);
    expect(result?.content).toContain("## Abstract");
    expect(result?.content).not.toContain("Close this dialog");
    expect(result?.content).not.toContain("# Journal list menu");
  });

  it("trims copied-page boilerplate to the article title and abstract", async () => {
    const result = await buildResultFromRemoteContent({
      url: "https://example.com/article",
      payload: {
        provider: "exa",
        url: "https://example.com/article",
        title: "Human well-being and per capita energy use - Jackson - 2022 - Ecosphere - Wiley Online Library",
        content: [
          "Skip to Article Content",
          "Skip to Article Information",
          "Ecosphere",
          "ARTICLE",
          "Open Access",
          "Human well-being and per capita energy use",
          "Robert B. Jackson, Anders Ahlström, Gustaf Hugelius",
          "First published: 12 April 2022",
          "Abstract",
          "Increased wealth and per capita energy use have transformed lives and shaped societies.",
          "INTRODUCTION",
          "Global metrics of health have been improving for decades.",
        ].join("\n"),
        html: null,
        metadata: null,
      },
      cacheMode: "default",
      maxCharacters: null,
      firecrawlDiagnostics: {
        attempted: false,
        used: false,
        cacheMode: "default",
        cacheStatus: "unknown",
        notes: null,
      },
      remoteContentDiagnostics: {
        provider: "exa",
        attempted: true,
        used: false,
        cacheMode: "default",
        cacheStatus: "unknown",
        notes: "HTML fetch failed; falling back to Exa",
      },
      markdownRequested: false,
      _deps: {} as never,
    });

    expect(result?.title).toBe("Human well-being and per capita energy use");
    expect(result?.content.startsWith("Human well-being and per capita energy use")).toBe(true);
    expect(result?.content).toContain("Abstract");
    expect(result?.content).not.toContain("Skip to Article Content");
    expect(result?.content).not.toContain("Open Access");
  });

  it("drops Wiley metadata chrome ahead of the abstract in live Exa content", async () => {
    const result = await buildResultFromRemoteContent({
      url: "https://example.com/article",
      payload: {
        provider: "exa",
        url: "https://example.com/article",
        title: "Human well‐being and per capita energy use - Jackson - 2022 - Ecosphere - Wiley Online Library",
        content: [
          "# Human well-being and per capita energy use",
          "Robert B. Jackson,",
          "Anders Ahlström,",
          "Gustaf Hugelius,",
          "Robert B. Jackson,",
          "Anders Ahlström,",
          "Gustaf Hugelius,",
          "First published: 12 April 2022",
          "https://doi.org/10.1002/ecs2.3978",
          "view metrics",
          "Handling Editor: Laura López-Hoffman",
          "Funding information Stanford Center for Advanced Study in the Behavioral Sciences",
          "Jackson, Robert B., AndersAhlström, GustafHugelius. 2022. “Human Well-Being and Per Capita Energy Use.” Ecosphere13(4): e3978. https://doi.org/10.1002/ecs2.3978",
          "PDF",
          "## Abstract",
          "Increased wealth and per capita energy use have transformed lives and shaped societies.",
        ].join("\n"),
        html: null,
        metadata: null,
      },
      cacheMode: "default",
      maxCharacters: null,
      firecrawlDiagnostics: {
        attempted: false,
        used: false,
        cacheMode: "default",
        cacheStatus: "unknown",
        notes: null,
      },
      remoteContentDiagnostics: {
        provider: "exa",
        attempted: true,
        used: false,
        cacheMode: "default",
        cacheStatus: "unknown",
        notes: "HTML fetch failed; falling back to Exa",
      },
      markdownRequested: false,
      _deps: {} as never,
    });

    expect(result?.title).toBe("Human well-being and per capita energy use");
    expect(result?.content.startsWith("# Human well-being and per capita energy use")).toBe(true);
    expect(result?.content).toContain("First published: 12 April 2022");
    expect(result?.content).toContain("## Abstract");
    expect(result?.content).not.toContain("view metrics");
    expect(result?.content).not.toContain("Handling Editor:");
    expect(result?.content).not.toContain("Funding information");
    expect(result?.content).not.toContain("Ecosphere13(4): e3978");
    expect(result?.content).not.toContain("\nPDF\n");
  });
});
