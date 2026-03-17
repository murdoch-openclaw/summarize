import { describe, expect, it, vi } from "vitest";
import { createLinkPreviewClient } from "../src/content/index.js";

const htmlResponse = (html: string, status = 200) =>
  new Response(html, {
    status,
    headers: { "Content-Type": "text/html" },
  });

describe("link preview extraction (Exa fallback)", () => {
  it("still prefers local HTML when Exa is configured but the page is already usable", async () => {
    const html = `<!doctype html><html><head><title>Ok</title></head><body><article><p>${"A".repeat(
      320,
    )}</p></article></body></html>`;

    const scrapeWithExa = vi.fn(async () => ({
      provider: "exa",
      url: "https://example.com",
      title: "Exa title",
      content: "Hello from Exa",
      html: null,
      metadata: null,
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "https://example.com") {
        return htmlResponse(html);
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    const client = createLinkPreviewClient({
      fetch: fetchMock as unknown as typeof fetch,
      scrapeWithExa,
    } as unknown as Parameters<typeof createLinkPreviewClient>[0]);

    const result = await client.fetchLinkContent("https://example.com", { timeoutMs: 2000 });
    expect(result.diagnostics.strategy).toBe("html");
    expect(scrapeWithExa).not.toHaveBeenCalled();
  });

  it("falls back to Exa when HTML looks blocked", async () => {
    const html =
      "<!doctype html><html><head><title>Blocked</title></head><body>Attention Required! | Cloudflare</body></html>";

    const scrapeWithExa = vi.fn(async () => ({
      provider: "exa",
      url: "https://example.com",
      title: "Exa title",
      content: "Hello from Exa",
      html: null,
      metadata: { author: "Ada" },
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "https://example.com") {
        return htmlResponse(html);
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    const client = createLinkPreviewClient({
      fetch: fetchMock as unknown as typeof fetch,
      scrapeWithExa,
    } as unknown as Parameters<typeof createLinkPreviewClient>[0]);

    const result = await client.fetchLinkContent("https://example.com", { timeoutMs: 2000 });
    expect(result.diagnostics.strategy).toBe("exa");
    expect(result.content).toContain("Hello from Exa");
    expect(scrapeWithExa).toHaveBeenCalledTimes(1);
  });

  it("still honors explicit Firecrawl mode when both Exa and Firecrawl are configured", async () => {
    const html = `<!doctype html><html><head><title>Ok</title></head><body><article><p>${"A".repeat(
      260,
    )}</p></article></body></html>`;

    const scrapeWithExa = vi.fn(async () => ({
      provider: "exa",
      url: "https://example.com",
      title: "Exa title",
      content: "Hello from Exa",
      html: null,
      metadata: null,
    }));
    const scrapeWithFirecrawl = vi.fn(async () => ({
      markdown: "Hello from Firecrawl",
      html: "<html><head><title>Firecrawl</title></head><body></body></html>",
      metadata: { title: "Firecrawl title" },
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "https://example.com") {
        return htmlResponse(html);
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    const client = createLinkPreviewClient({
      fetch: fetchMock as unknown as typeof fetch,
      scrapeWithExa,
      scrapeWithFirecrawl,
    } as unknown as Parameters<typeof createLinkPreviewClient>[0]);

    const result = await client.fetchLinkContent("https://example.com", {
      timeoutMs: 2000,
      firecrawl: "always",
    });
    expect(result.diagnostics.strategy).toBe("firecrawl");
    expect(result.content).toContain("Hello from Firecrawl");
    expect(scrapeWithFirecrawl).toHaveBeenCalledTimes(1);
    expect(scrapeWithExa).not.toHaveBeenCalled();
  });

  it("does not call Exa when the HTML request is a true not-found response", async () => {
    const scrapeWithExa = vi.fn(async () => ({
      provider: "exa",
      url: "https://example.com/missing",
      title: "Exa title",
      content: "Hello from Exa",
      html: null,
      metadata: null,
    }));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "https://example.com/missing") {
        return htmlResponse("<html>missing</html>", 404);
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    const client = createLinkPreviewClient({
      fetch: fetchMock as unknown as typeof fetch,
      scrapeWithExa,
    } as unknown as Parameters<typeof createLinkPreviewClient>[0]);

    await expect(
      client.fetchLinkContent("https://example.com/missing", { timeoutMs: 2000 }),
    ).rejects.toThrow("Failed to fetch HTML document (status 404)");
    expect(scrapeWithExa).not.toHaveBeenCalled();
  });
});
