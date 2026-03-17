import type { ExtractedLinkContent, FetchLinkContentOptions } from "../../../content/index.js";
import { formatBytes } from "../../../tty/format.js";
import { withBirdTip } from "../../bird.js";
import { buildSummaryFinishLabel } from "../../finish-line.js";
import { formatOptionalNumber, formatOptionalString } from "../../format.js";
import { writeVerbose } from "../../logging.js";

export type UrlExtractionUi = {
  contentSizeLabel: string;
  viaSourceLabel: string;
  footerParts: string[];
  finishSourceLabel: string | null;
};

export async function fetchLinkContentWithBirdTip({
  client,
  url,
  options,
  env,
}: {
  client: {
    fetchLinkContent: (
      url: string,
      options?: FetchLinkContentOptions,
    ) => Promise<ExtractedLinkContent>;
  };
  url: string;
  options: FetchLinkContentOptions;
  env: Record<string, string | undefined>;
}): Promise<ExtractedLinkContent> {
  try {
    return await client.fetchLinkContent(url, options);
  } catch (error) {
    throw withBirdTip(error, url, env);
  }
}

export function deriveExtractionUi(extracted: ExtractedLinkContent): UrlExtractionUi {
  const extractedContentBytes = Buffer.byteLength(extracted.content, "utf8");
  const contentSizeLabel = formatBytes(extractedContentBytes);
  const strategy = String(extracted.diagnostics.strategy ?? "");
  const twitterStrategy =
    strategy === "xurl" || strategy === "bird"
      ? strategy
      : null;

  const viaSources: string[] = [];
  if (twitterStrategy) {
    viaSources.push(twitterStrategy);
  }
  if (strategy === "nitter") {
    viaSources.push("Nitter");
  }
  if (strategy === "exa") {
    viaSources.push("Exa");
  }
  if (extracted.diagnostics.firecrawl.used) {
    viaSources.push("Firecrawl");
  }
  const viaSourceLabel = viaSources.length > 0 ? `, ${viaSources.join("+")}` : "";

  const footerParts: string[] = [];
  if (strategy === "html") footerParts.push("html");
  if (twitterStrategy) footerParts.push(twitterStrategy);
  if (strategy === "nitter") footerParts.push("nitter");
  if (strategy === "exa") footerParts.push("exa");
  if (extracted.diagnostics.firecrawl.used) footerParts.push("firecrawl");
  if (extracted.diagnostics.markdown.used) {
    if (extracted.diagnostics.markdown.provider === "llm") {
      footerParts.push(
        extracted.diagnostics.markdown.notes === "transcript" ? "transcript→md llm" : "html→md llm",
      );
    } else {
      footerParts.push("markdown");
    }
  }
  if (extracted.diagnostics.transcript.textProvided) {
    footerParts.push(`transcript ${extracted.diagnostics.transcript.provider ?? "unknown"}`);
  }
  if (extracted.isVideoOnly && extracted.video) {
    footerParts.push(extracted.video.kind === "youtube" ? "video youtube" : "video url");
  }

  const finishSourceLabel = buildSummaryFinishLabel({
    extracted: { diagnostics: extracted.diagnostics, wordCount: extracted.wordCount },
  });

  return {
    contentSizeLabel,
    viaSourceLabel,
    footerParts,
    finishSourceLabel,
  };
}

export function logExtractionDiagnostics({
  extracted,
  stderr,
  verbose,
  verboseColor,
  env,
}: {
  extracted: ExtractedLinkContent;
  stderr: NodeJS.WritableStream;
  verbose: boolean;
  verboseColor: boolean;
  env?: Record<string, string | undefined>;
}) {
  writeVerbose(
    stderr,
    verbose,
    `extract done strategy=${extracted.diagnostics.strategy} siteName=${formatOptionalString(
      extracted.siteName,
    )} title=${formatOptionalString(extracted.title)} transcriptSource=${formatOptionalString(
      extracted.transcriptSource,
    )}`,
    verboseColor,
    env,
  );
  writeVerbose(
    stderr,
    verbose,
    `extract stats characters=${extracted.totalCharacters} words=${extracted.wordCount} transcriptCharacters=${formatOptionalNumber(
      extracted.transcriptCharacters,
    )} transcriptLines=${formatOptionalNumber(extracted.transcriptLines)}`,
    verboseColor,
    env,
  );
  writeVerbose(
    stderr,
    verbose,
    `extract firecrawl attempted=${extracted.diagnostics.firecrawl.attempted} used=${extracted.diagnostics.firecrawl.used} notes=${formatOptionalString(
      extracted.diagnostics.firecrawl.notes ?? null,
    )}`,
    verboseColor,
    env,
  );
  writeVerbose(
    stderr,
    verbose,
    `extract remote provider=${formatOptionalString(
      extracted.diagnostics.remoteContent?.provider ?? null,
    )} attempted=${Boolean(extracted.diagnostics.remoteContent?.attempted)} used=${Boolean(
      extracted.diagnostics.remoteContent?.used,
    )} notes=${formatOptionalString(extracted.diagnostics.remoteContent?.notes ?? null)}`,
    verboseColor,
    env,
  );
  writeVerbose(
    stderr,
    verbose,
    `extract markdown requested=${extracted.diagnostics.markdown.requested} used=${extracted.diagnostics.markdown.used} provider=${formatOptionalString(
      extracted.diagnostics.markdown.provider ?? null,
    )} notes=${formatOptionalString(extracted.diagnostics.markdown.notes ?? null)}`,
    verboseColor,
    env,
  );
  writeVerbose(
    stderr,
    verbose,
    `extract transcript textProvided=${extracted.diagnostics.transcript.textProvided} provider=${formatOptionalString(
      extracted.diagnostics.transcript.provider ?? null,
    )} attemptedProviders=${
      extracted.diagnostics.transcript.attemptedProviders.length > 0
        ? extracted.diagnostics.transcript.attemptedProviders.join(",")
        : "none"
    } notes=${formatOptionalString(extracted.diagnostics.transcript.notes ?? null)}`,
    verboseColor,
    env,
  );
}
