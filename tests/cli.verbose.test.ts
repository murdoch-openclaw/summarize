import { Writable } from "node:stream";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/run.js";

describe("--verbose", () => {
  it("prints progress and extraction diagnostics to stderr", async () => {
    const html =
      "<!doctype html><html><head><title>Hello</title></head>" +
      "<body><article><p>Some article content.</p></article></body></html>";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "https://example.com") {
        return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    let stderrText = "";
    const stderr = new Writable({
      write(chunk, _encoding, callback) {
        stderrText += chunk.toString();
        callback();
      },
    });

    const stdout = new Writable({
      write(chunk, encoding, callback) {
        void chunk;
        void encoding;
        callback();
      },
    });

    await runCli(
      [
        "--json",
        "--verbose",
        "--extract",
        "--format",
        "text",
        "--firecrawl",
        "off",
        "--timeout",
        "10s",
        "https://example.com",
      ],
      {
        env: {},
        fetch: fetchMock as unknown as typeof fetch,
        stdout,
        stderr,
      },
    );

    expect(stderrText).toContain("[summarize] config url=https://example.com");
    expect(stderrText).toContain("[summarize] extract start");
    expect(stderrText).toContain("[summarize] extract done strategy=html");
    expect(stderrText).toContain("transcriptSource=none");
    expect(stderrText).toContain("extract firecrawl attempted=false used=false");
    expect(stderrText).toContain("extract transcript textProvided=false");
  });

  it("uses ANSI colors when stderr is a rich TTY", async () => {
    const html =
      "<!doctype html><html><head><title>Hello</title></head>" +
      "<body><article><p>Some article content.</p></article></body></html>";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "https://example.com") {
        return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    let stderrText = "";
    const stderr = new Writable({
      write(chunk, _encoding, callback) {
        stderrText += chunk.toString();
        callback();
      },
    });
    (stderr as unknown as { isTTY?: boolean }).isTTY = true;

    const stdout = new Writable({
      write(chunk, encoding, callback) {
        void chunk;
        void encoding;
        callback();
      },
    });

    await runCli(
      [
        "--json",
        "--verbose",
        "--extract",
        "--format",
        "text",
        "--firecrawl",
        "off",
        "https://example.com",
      ],
      {
        env: { TERM: "xterm-256color" },
        fetch: fetchMock as unknown as typeof fetch,
        stdout,
        stderr,
      },
    );

    expect(stderrText).toContain("\u001b[");
  });

  it("prints Exa extraction diagnostics when Exa wins the fallback", async () => {
    const blockedHtml =
      "<!doctype html><html><head><title>Blocked</title></head><body>Attention Required! | Cloudflare</body></html>";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "https://example.com") {
        return new Response(blockedHtml, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
      if (url === "https://api.exa.ai/contents") {
        expect(init?.method).toBe("POST");
        return Response.json({
          results: [
            {
              url: "https://example.com",
              title: "Exa title",
              text: "Hello from Exa",
            },
          ],
          statuses: [],
        });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    let stderrText = "";
    const stderr = new Writable({
      write(chunk, _encoding, callback) {
        stderrText += chunk.toString();
        callback();
      },
    });

    const stdout = new Writable({
      write(chunk, encoding, callback) {
        void chunk;
        void encoding;
        callback();
      },
    });

    await runCli(
      ["--json", "--verbose", "--extract", "--format", "text", "--timeout", "10s", "https://example.com"],
      {
        env: { EXA_API_KEY: "exa-test" },
        fetch: fetchMock as unknown as typeof fetch,
        stdout,
        stderr,
      },
    );

    expect(stderrText).toContain("exaKey=true");
    expect(stderrText).toContain("[summarize] extract done strategy=exa");
    expect(stderrText).toContain("extract remote provider=exa attempted=true used=true");
  });

  it("bypasses extract cache in --extract mode when --no-cache is set", async () => {
    const root = mkdtempSync(join(tmpdir(), "summarize-no-extract-cache-"));
    const html =
      "<!doctype html><html><head><title>Hello</title></head>" +
      "<body><article><p>Some article content.</p></article></body></html>";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "https://example.com") {
        return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    const createSink = () => {
      let text = "";
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          text += chunk.toString();
          callback();
        },
      });
      return { stream, getText: () => text };
    };

    const firstStderr = createSink();
    await runCli(
      ["--json", "--verbose", "--extract", "--no-cache", "--timeout", "10s", "https://example.com"],
      {
        env: { HOME: root },
        fetch: fetchMock as unknown as typeof fetch,
        stdout: createSink().stream,
        stderr: firstStderr.stream,
      },
    );
    const firstExampleCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "https://example.com";
    }).length;
    fetchMock.mockClear();

    const secondStderr = createSink();
    await runCli(
      ["--json", "--verbose", "--extract", "--no-cache", "--timeout", "10s", "https://example.com"],
      {
        env: { HOME: root },
        fetch: fetchMock as unknown as typeof fetch,
        stdout: createSink().stream,
        stderr: secondStderr.stream,
      },
    );

    const secondExampleCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === "string" ? input : input.url;
      return url === "https://example.com";
    }).length;
    expect(firstExampleCalls).toBeGreaterThan(0);
    expect(secondExampleCalls).toBeGreaterThan(0);
    expect(firstStderr.getText()).not.toContain("cache hit extract");
    expect(firstStderr.getText()).not.toContain("cache write extract");
    expect(secondStderr.getText()).not.toContain("cache hit extract");
    expect(secondStderr.getText()).not.toContain("cache write extract");
  });
});

describe("--debug", () => {
  it("acts like --verbose", async () => {
    const html =
      "<!doctype html><html><head><title>Hello</title></head>" +
      "<body><article><p>Some article content.</p></article></body></html>";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "https://example.com") {
        return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });

    let stderrText = "";
    const stderr = new Writable({
      write(chunk, _encoding, callback) {
        stderrText += chunk.toString();
        callback();
      },
    });

    const stdout = new Writable({
      write(chunk, encoding, callback) {
        void chunk;
        void encoding;
        callback();
      },
    });

    await runCli(
      [
        "--json",
        "--debug",
        "--extract",
        "--format",
        "text",
        "--firecrawl",
        "off",
        "--timeout",
        "10s",
        "https://example.com",
      ],
      {
        env: {},
        fetch: fetchMock as unknown as typeof fetch,
        stdout,
        stderr,
      },
    );

    expect(stderrText).toContain("[summarize] config url=https://example.com");
    expect(stderrText).toContain("[summarize] extract start");
  });
});
