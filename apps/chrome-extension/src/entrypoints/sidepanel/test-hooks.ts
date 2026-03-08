import type { SseSlidesData } from "../../../../../src/shared/sse-events.js";
import type { SlidesLayout } from "../../lib/settings";
import type { PanelPhase, RunStart, UiState } from "./types";

type BgToPanelMessage =
  | { type: "ui:state"; state: UiState }
  | { type: "ui:status"; status: string }
  | { type: "run:start"; run: RunStart }
  | { type: "run:error"; message: string }
  | { type: "slides:run"; ok: boolean; runId?: string; url?: string; error?: string }
  | { type: "chat:history"; requestId: string; ok: boolean; messages?: unknown[]; error?: string }
  | { type: "agent:chunk"; requestId: string; text: string }
  | {
      type: "agent:response";
      requestId: string;
      ok: boolean;
      assistant?: unknown;
      error?: string;
    }
  | {
      type: "slides:context";
      requestId: string;
      ok: boolean;
      transcriptTimedText?: string | null;
      error?: string;
    }
  | { type: "ui:cache"; requestId: string; ok: boolean; cache?: unknown };

type SummarizeMode = { mode: "page" | "video"; slides: boolean };

type SidepanelTestHooks = {
  applySlidesPayload?: (payload: SseSlidesData) => void;
  getRunId?: () => string | null;
  getSummaryMarkdown?: () => string;
  getSlideDescriptions?: () => Array<[number, string]>;
  getPhase?: () => PanelPhase;
  getModel?: () => string | null;
  getSlidesTimeline?: () => Array<{ index: number; timestamp: number | null }>;
  getTranscriptTimedText?: () => string | null;
  getSlidesSummaryMarkdown?: () => string;
  getSlidesSummaryComplete?: () => boolean;
  getSlidesSummaryModel?: () => string | null;
  getChatEnabled?: () => boolean;
  getSettingsHydrated?: () => boolean;
  setTranscriptTimedText?: (value: string | null) => void;
  setSummarizeMode?: (payload: SummarizeMode) => Promise<void>;
  getSummarizeMode?: () => { mode: "page" | "video"; slides: boolean; mediaAvailable: boolean };
  getSlidesState?: () => { slidesCount: number; layout: SlidesLayout; hasSlides: boolean };
  renderSlidesNow?: () => void;
  applyUiState?: (state: UiState) => void;
  applyBgMessage?: (message: BgToPanelMessage) => void;
  applySummarySnapshot?: (payload: { run: RunStart; markdown: string }) => void;
  applySummaryMarkdown?: (markdown: string) => void;
  forceRenderSlides?: () => void;
  showInlineError?: (message: string) => void;
  isInlineErrorVisible?: () => boolean;
  getInlineErrorMessage?: () => string;
};

export function registerSidepanelTestHooks(options: {
  applySlidesPayload: (payload: SseSlidesData) => void;
  getRunId: () => string | null;
  getSummaryMarkdown: () => string;
  getSlideDescriptions: () => Array<[number, string]>;
  getPhase: () => PanelPhase;
  getModel: () => string | null;
  getSlidesTimeline: () => Array<{ index: number; timestamp: number | null }>;
  getTranscriptTimedText: () => string | null;
  getSlidesSummaryMarkdown: () => string;
  getSlidesSummaryComplete: () => boolean;
  getSlidesSummaryModel: () => string | null;
  getChatEnabled: () => boolean;
  getSettingsHydrated: () => boolean;
  setTranscriptTimedText: (value: string | null) => void;
  setSummarizeMode: (payload: SummarizeMode) => Promise<void>;
  getSummarizeMode: () => { mode: "page" | "video"; slides: boolean; mediaAvailable: boolean };
  getSlidesState: () => { slidesCount: number; layout: SlidesLayout; hasSlides: boolean };
  renderSlidesNow: () => void;
  applyUiState: (state: UiState) => void;
  applyBgMessage: (message: BgToPanelMessage) => void;
  applySummarySnapshot: (payload: { run: RunStart; markdown: string }) => void;
  applySummaryMarkdown: (markdown: string) => void;
  forceRenderSlides: () => void;
  showInlineError: (message: string) => void;
  isInlineErrorVisible: () => boolean;
  getInlineErrorMessage: () => string;
}) {
  const hooks = (
    globalThis as {
      __summarizeTestHooks?: SidepanelTestHooks;
    }
  ).__summarizeTestHooks;
  if (!hooks) return;

  hooks.applySlidesPayload = options.applySlidesPayload;
  hooks.getRunId = options.getRunId;
  hooks.getSummaryMarkdown = options.getSummaryMarkdown;
  hooks.getSlideDescriptions = options.getSlideDescriptions;
  hooks.getPhase = options.getPhase;
  hooks.getModel = options.getModel;
  hooks.getSlidesTimeline = options.getSlidesTimeline;
  hooks.getTranscriptTimedText = options.getTranscriptTimedText;
  hooks.getSlidesSummaryMarkdown = options.getSlidesSummaryMarkdown;
  hooks.getSlidesSummaryComplete = options.getSlidesSummaryComplete;
  hooks.getSlidesSummaryModel = options.getSlidesSummaryModel;
  hooks.getChatEnabled = options.getChatEnabled;
  hooks.getSettingsHydrated = options.getSettingsHydrated;
  hooks.setTranscriptTimedText = options.setTranscriptTimedText;
  hooks.setSummarizeMode = options.setSummarizeMode;
  hooks.getSummarizeMode = options.getSummarizeMode;
  hooks.getSlidesState = options.getSlidesState;
  hooks.renderSlidesNow = options.renderSlidesNow;
  hooks.applyUiState = options.applyUiState;
  hooks.applyBgMessage = options.applyBgMessage;
  hooks.applySummarySnapshot = options.applySummarySnapshot;
  hooks.applySummaryMarkdown = options.applySummaryMarkdown;
  hooks.forceRenderSlides = options.forceRenderSlides;
  hooks.showInlineError = options.showInlineError;
  hooks.isInlineErrorVisible = options.isInlineErrorVisible;
  hooks.getInlineErrorMessage = options.getInlineErrorMessage;
}
