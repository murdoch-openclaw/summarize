import { describe, expect, it, vi } from "vitest";
import { createExaContentsScraper } from "../src/exa.js";

describe("createExaContentsScraper", () => {
  it("posts /contents and normalizes successful text results", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      expect(url).toBe("https://api.exa.ai/contents");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Accept: "application/json",
        "x-api-key": "KEY",
        "Content-Type": "application/json",
        "x-exa-integration": "crawling-mcp",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        ids: ["https://example.com/article"],
        contents: {
          text: {
            maxCharacters: 4321,
          },
          livecrawl: "preferred",
        },
      });

      return Response.json(
        {
          requestId: "req_123",
          costDollars: 0.01,
          results: [
            {
              url: "https://example.com/article",
              title: "Exa title",
              text: "Hello from Exa",
              author: "Ada Lovelace",
              publishedDate: "2026-03-15T00:00:00.000Z",
            },
          ],
          statuses: [],
        },
        { status: 200 },
      );
    });

    const scrape = createExaContentsScraper({
      apiKey: "KEY",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await scrape("https://example.com/article", {
      timeoutMs: 1000,
      maxCharacters: 4321,
    });

    expect(result).toEqual({
      provider: "exa",
      url: "https://example.com/article",
      title: "Exa title",
      content: "Hello from Exa",
      html: null,
      metadata: {
        author: "Ada Lovelace",
        publishedDate: "2026-03-15T00:00:00.000Z",
      },
    });
  });

  it("returns null when Exa text content is empty", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [{ url: "https://example.com/article", title: "Exa title", text: "   " }],
        statuses: [],
      }),
    );

    const scrape = createExaContentsScraper({
      apiKey: "KEY",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(scrape("https://example.com/article")).resolves.toBeNull();
  });

  it("throws an error when Exa returns non-2xx with an error payload", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: "nope" }, { status: 403 }),
    );

    const scrape = createExaContentsScraper({
      apiKey: "KEY",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(scrape("https://example.com/article")).rejects.toThrow(
      "Exa contents request failed (403): nope",
    );
  });

  it("throws a timeout error when aborted", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise((_resolve, reject) => {
          if (!signal) {
            reject(new Error("Missing abort signal"));
            return;
          }
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }) as Promise<Response>;
      });

      const scrape = createExaContentsScraper({
        apiKey: "KEY",
        fetchImpl: fetchMock as unknown as typeof fetch,
      });

      const promise = scrape("https://example.com/article", { timeoutMs: 10 });
      const assertion = expect(promise).rejects.toThrow("Exa contents request timed out");
      await vi.advanceTimersByTimeAsync(20);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws when Exa reports a per-URL status error in a 200 response", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [],
        statuses: [
          {
            url: "https://example.com/article",
            status: "error",
            error: {
              tag: "CRAWL_TIMEOUT",
              message: "crawl exceeded timeout",
            },
          },
        ],
      }),
    );

    const scrape = createExaContentsScraper({
      apiKey: "KEY",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(scrape("https://example.com/article")).rejects.toThrow(
      "Exa contents status error for https://example.com/article: CRAWL_TIMEOUT (crawl exceeded timeout)",
    );
  });

  it("falls back to the requested URL when Exa omits both status.url and status.id", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [],
        statuses: [
          {
            status: "error",
            error: {
              tag: "CRAWL_NOT_FOUND",
            },
          },
        ],
      }),
    );

    const scrape = createExaContentsScraper({
      apiKey: "KEY",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(scrape("https://example.com/missing")).rejects.toThrow(
      "Exa contents status error for https://example.com/missing: CRAWL_NOT_FOUND",
    );
  });

  it("uses the official MCP default crawl budget when maxCharacters is omitted", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        ids: ["https://example.com/article"],
        contents: {
          text: {
            maxCharacters: 2000,
          },
          livecrawl: "preferred",
        },
      });

      return Response.json({
        results: [{ url: "https://example.com/article", title: "Exa title", text: "Hello" }],
        statuses: [],
      });
    });

    const scrape = createExaContentsScraper({
      apiKey: "KEY",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(scrape("https://example.com/article")).resolves.toEqual({
      provider: "exa",
      url: "https://example.com/article",
      title: "Exa title",
      content: "Hello",
      html: null,
      metadata: null,
    });
  });

  it("accepts result.id and status.id from the current contents API shape", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            id: "https://example.com/requested",
            title: "Exa title",
            text: "Hello from Exa",
          },
        ],
        statuses: [
          {
            id: "https://example.com/requested",
            status: "success",
          },
        ],
      }),
    );

    const scrape = createExaContentsScraper({
      apiKey: "KEY",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(scrape("https://example.com/requested")).resolves.toEqual({
      provider: "exa",
      url: "https://example.com/requested",
      title: "Exa title",
      content: "Hello from Exa",
      html: null,
      metadata: null,
    });
  });
});
