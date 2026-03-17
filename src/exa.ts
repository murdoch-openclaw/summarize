import type { RemoteContentPayload, ScrapeWithExaContents } from "@steipete/summarize-core/content";

type ExaContentsResponse = {
  results?: Array<Record<string, unknown>> | null;
  statuses?: Array<Record<string, unknown>> | null;
  error?: string | { message?: string | null } | null;
};

function readErrorMessage(payload: ExaContentsResponse | null): string | null {
  const error = payload?.error;
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function buildMetadata(result: Record<string, unknown>): Record<string, unknown> | null {
  const metadata: Record<string, unknown> = {};
  for (const key of ["author", "publishedDate", "description", "siteName"]) {
    const value = result[key];
    if (typeof value === "string" && value.trim().length > 0) {
      metadata[key] = value;
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function buildStatusError(
  statuses: Array<Record<string, unknown>> | null | undefined,
  requestedUrl: string,
): Error | null {
  if (!statuses?.length) return null;

  for (const status of statuses) {
    const rawError = status.error;
    if (!rawError || typeof rawError !== "object") continue;
    const tag = readString((rawError as { tag?: unknown }).tag) ?? "UNKNOWN";
    const message = readString((rawError as { message?: unknown }).message);
    const url = readString(status.url) ?? readString(status.id) ?? requestedUrl;
    const suffix = message ? ` (${message})` : "";
    return new Error(`Exa contents status error for ${url}: ${tag}${suffix}`);
  }

  return null;
}

export function createExaContentsScraper({
  apiKey,
  fetchImpl,
}: {
  apiKey: string;
  fetchImpl: typeof fetch;
}): ScrapeWithExaContents {
  return async (
    url: string,
    options?: { timeoutMs?: number; maxCharacters?: number | null },
  ): Promise<RemoteContentPayload | null> => {
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs;
    const hasTimeout = typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0;
    const timeout = hasTimeout ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const maxCharacters =
      typeof options?.maxCharacters === "number" && Number.isFinite(options.maxCharacters)
        ? Math.max(1, Math.trunc(options.maxCharacters))
        : 2_000;

    try {
      const response = await fetchImpl("https://api.exa.ai/contents", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          "x-exa-integration": "crawling-mcp",
        },
        signal: controller.signal,
        body: JSON.stringify({
          ids: [url],
          contents: {
            text: {
              maxCharacters,
            },
            livecrawl: "preferred",
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as ExaContentsResponse | null;

      if (!response.ok) {
        const message = readErrorMessage(payload);
        throw new Error(
          `Exa contents request failed (${response.status})${message ? `: ${message}` : ""}`,
        );
      }

      const statusError = buildStatusError(payload?.statuses, url);
      if (statusError) {
        throw statusError;
      }

      const result = Array.isArray(payload?.results) ? payload.results[0] : null;
      if (!result || typeof result !== "object") {
        return null;
      }

      const text = readString(result.text);
      if (!text) {
        return null;
      }

      return {
        provider: "exa",
        url: readString(result.url) ?? readString(result.id) ?? url,
        title: readString(result.title),
        content: text,
        html: null,
        metadata: buildMetadata(result),
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("Exa contents request timed out");
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
}
