import type { LinkPreviewDeps, RemoteContentPayload } from "../deps.js";
import type { CacheMode, FirecrawlDiagnostics, RemoteContentDiagnostics } from "../types.js";
import type { ExtractedLinkContent } from "./types.js";
import { normalizeForPrompt } from "./cleaner.js";
import { finalizeExtractedLinkContent, safeHostname } from "./utils.js";

function normalizeRemoteTitle(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeForPrompt(value);
  return normalized.length > 0 ? normalized : null;
}

function canonicalizeTitleForMatch(value: string | null): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replaceAll(/[\u2010-\u2015\u2212]/g, "-")
    .replaceAll(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function isGenericRemoteTitle(title: string | null): boolean {
  if (!title) return false;
  return /^(journal list menu|login( \/ register)?|register|close( this dialog)?|search|recommended|metrics|details)$/i.test(
    title,
  );
}

function isBoilerplateRemoteLine(line: string): boolean {
  return /^(skip to article|article|open access|sectionspdf|cite|tools share|search|search within|this journal|ecosphere)$/i.test(
    line,
  );
}

function shouldDropPrefaceLine(line: string, preferredTitle: string | null): boolean {
  if (isBoilerplateRemoteLine(line)) return true;
  if (/^(view metrics|pdf)$/i.test(line)) return true;
  if (/^(handling editor:|funding information\b)/i.test(line)) return true;
  if (
    preferredTitle &&
    line.length > preferredTitle.length + 20 &&
    /https?:\/\/doi\.org\//i.test(line) &&
    canonicalizeTitleForMatch(line).includes(canonicalizeTitleForMatch(preferredTitle))
  ) {
    return true;
  }
  return false;
}

function dropRepeatedLeadingBlock(lines: string[]): string[] {
  if (lines.length < 3) return lines;
  const [head, ...rest] = lines;
  const maxBlockLength = Math.floor(rest.length / 2);
  for (let blockLength = maxBlockLength; blockLength >= 1; blockLength -= 1) {
    const first = rest.slice(0, blockLength);
    const second = rest.slice(blockLength, blockLength * 2);
    if (
      second.length === blockLength &&
      first.every((line, index) => canonicalizeTitleForMatch(line) === canonicalizeTitleForMatch(second[index] ?? null))
    ) {
      return [head, ...first, ...rest.slice(blockLength * 2)];
    }
  }
  return lines;
}

function cleanRemoteContent(payload: RemoteContentPayload): { content: string; title: string | null } {
  const normalizedContent = normalizeForPrompt(payload.content ?? "");
  const fallbackTitle = normalizeRemoteTitle(payload.title);
  if (normalizedContent.length === 0) {
    return { content: normalizedContent, title: fallbackTitle };
  }

  const lines = normalizedContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { content: normalizedContent, title: fallbackTitle };
  }

  const sectionBoundary = lines.findIndex((line) => /^##?\s*(abstract|introduction)\b/i.test(line));
  const headingIndex = lines.findIndex((line, index) => {
    if (!/^#\s+/.test(line)) return false;
    if (sectionBoundary >= 0 && index >= sectionBoundary) return false;
    const title = normalizeRemoteTitle(line.replace(/^#\s+/, ""));
    if (!title) return false;
    if (title.length < 12) return false;
    return !isGenericRemoteTitle(title);
  });

  const plainTitleIndex = lines.findIndex((line, index) => {
    if (headingIndex >= 0) return false;
    if (sectionBoundary >= 0 && index >= sectionBoundary) return false;
    const title = normalizeRemoteTitle(line);
    if (!title) return false;
    if (title.length < 12 || title.length > 200) return false;
    if (isGenericRemoteTitle(title) || isBoilerplateRemoteLine(title)) return false;
    const lookahead = lines.slice(index + 1, index + 6).join("\n");
    return /(^|\n)(first published:|handling editor:|funding information\b|abstract\b|https?:\/\/doi\.org\/)/i.test(
      lookahead,
    );
  });

  const preferredTitle =
    headingIndex >= 0
      ? normalizeRemoteTitle(lines[headingIndex]?.replace(/^#\s+/, ""))
      : (lines[plainTitleIndex] ?? null);
  const normalizedFallbackTitle = canonicalizeTitleForMatch(fallbackTitle);
  const normalizedPreferredTitle = canonicalizeTitleForMatch(preferredTitle);
  const title =
    preferredTitle &&
    (!fallbackTitle ||
      isGenericRemoteTitle(fallbackTitle) ||
      (fallbackTitle.length > preferredTitle.length &&
        normalizedFallbackTitle.includes(normalizedPreferredTitle)))
      ? preferredTitle
      : fallbackTitle;

  const startIndex = headingIndex >= 0 ? headingIndex : plainTitleIndex;
  const beforeSection =
    startIndex >= 0 && (sectionBoundary < 0 || startIndex < sectionBoundary)
      ? lines.slice(startIndex, sectionBoundary >= 0 ? sectionBoundary : undefined)
      : null;
  const afterSection = sectionBoundary >= 0 ? lines.slice(sectionBoundary) : [];
  const cleanedBeforeSection =
    beforeSection === null
      ? null
      : dropRepeatedLeadingBlock(beforeSection).filter(
          (line, index) => index === 0 || !shouldDropPrefaceLine(line, preferredTitle),
        );

  const content =
    cleanedBeforeSection
      ? normalizeForPrompt([...cleanedBeforeSection, ...afterSection].join("\n"))
      : startIndex >= 0 && (sectionBoundary < 0 || startIndex < sectionBoundary)
        ? normalizeForPrompt(lines.slice(startIndex).join("\n"))
      : normalizedContent;

  return {
    content,
    title: title ?? preferredTitle,
  };
}

export async function buildResultFromRemoteContent({
  url,
  payload,
  cacheMode,
  maxCharacters,
  firecrawlDiagnostics,
  remoteContentDiagnostics,
  markdownRequested,
  _deps,
}: {
  url: string;
  payload: RemoteContentPayload;
  cacheMode: CacheMode;
  maxCharacters: number | null;
  firecrawlDiagnostics: FirecrawlDiagnostics;
  remoteContentDiagnostics: RemoteContentDiagnostics;
  markdownRequested: boolean;
  _deps: LinkPreviewDeps;
}): Promise<ExtractedLinkContent | null> {
  const cleaned = cleanRemoteContent(payload);
  if (cleaned.content.length === 0) {
    return null;
  }
  remoteContentDiagnostics.used = true;

  return finalizeExtractedLinkContent({
    url,
    baseContent: cleaned.content,
    maxCharacters,
    title: cleaned.title,
    description:
      typeof payload.metadata?.description === "string" ? payload.metadata.description : null,
    siteName:
      typeof payload.metadata?.siteName === "string"
        ? payload.metadata.siteName
        : safeHostname(payload.url || url),
    transcriptResolution: {
      source: null,
      text: null,
      metadata: null,
      segments: null,
    },
    video: null,
    isVideoOnly: false,
    diagnostics: {
      strategy: payload.provider,
      firecrawl: firecrawlDiagnostics,
      remoteContent: remoteContentDiagnostics,
      markdown: {
        requested: markdownRequested,
        used: false,
        provider: null,
        notes: `${payload.provider} content used as plain text`,
      },
      transcript: {
        cacheMode,
        cacheStatus: cacheMode === "bypass" ? "bypassed" : "unknown",
        textProvided: false,
        provider: null,
        attemptedProviders: [],
      },
    },
  });
}
