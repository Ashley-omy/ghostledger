import type { Mode } from '../schemas';

export interface Availability {
  ok: boolean;
  /** Why the provider can't be used right now (shown in the UI), or null. */
  reason: string | null;
}

export interface GenerateOptions {
  signal?: AbortSignal;
  /** Streamed text, for a live preview while the model works. */
  onToken?: (text: string) => void;
  /** Human-readable status before tokens arrive, e.g. "Loading model into memory… 40%". */
  onStatus?: (status: string) => void;
}

/**
 * One interface for every place a model can run (docs/ARCHITECTURE.md §5).
 * Providers only talk to the model. Prompts, validation and post-processing live in extractor.ts
 * and insights.ts, so every provider behaves the same.
 */
export interface LLMProvider {
  readonly mode: Mode;
  readonly extractModel: string;
  readonly insightModel: string;
  /** Human-readable target, shown in the privacy preview, e.g. "This device (Gemma 4 E2B)". */
  readonly destination: string;

  available(): Promise<Availability>;

  /** Image + prompt → raw model text (expected to contain JSON). */
  extract(image: Blob, prompt: string, opts?: GenerateOptions): Promise<string>;

  /** System prompt + JSON payload → Markdown text. */
  analyze(system: string, payload: object, opts?: GenerateOptions): Promise<string>;
}
