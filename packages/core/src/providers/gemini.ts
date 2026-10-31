/**
 * Online (opt-in) provider: Gemma 4 26B / 31B through the Gemini API.
 *
 * Key handling (docs/ARCHITECTURE.md §7):
 *  - Option A (default): the user pastes their own key; it stays on the device.
 *  - Option B: set `baseUrl` to our thin proxy, which adds the key server-side. Then `apiKey` can be any placeholder.
 */
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { AppError } from '../errors';
import { blobToBase64 } from '../image';
import type { Availability, GenerateOptions, LLMProvider } from './types';

export interface GeminiProviderOptions {
  apiKey: string;
  baseUrl?: string;
  extractModel?: string;
  insightModel?: string;
}

export class GeminiProvider implements LLMProvider {
  readonly mode = 'online' as const;
  readonly extractModel: string;
  readonly insightModel: string;
  readonly destination: string;
  private readonly ai: GoogleGenAI | null;

  constructor(private readonly opts: GeminiProviderOptions) {
    this.extractModel = opts.extractModel ?? 'gemma-4-26b-a4b-it';
    this.insightModel = opts.insightModel ?? 'gemma-4-31b-it';
    this.destination = `Gemini API (${this.insightModel})`;
    this.ai = opts.apiKey
      ? new GoogleGenAI({ apiKey: opts.apiKey, httpOptions: opts.baseUrl ? { baseUrl: opts.baseUrl } : undefined })
      : null;
  }

  async available(): Promise<Availability> {
    if (!this.ai) return { ok: false, reason: 'No Gemini API key. Add one in Settings to enable Online mode.' };
    if (!navigator.onLine) return { ok: false, reason: 'No internet connection.' };
    return { ok: true, reason: null };
  }

  async extract(image: Blob, prompt: string, opts: GenerateOptions = {}): Promise<string> {
    const ai = this.client();
    const resp = await ai.models.generateContent({
      model: this.extractModel,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: image.type || 'image/jpeg', data: await blobToBase64(image) } }, { text: prompt }],
        },
      ],
      config: { responseMimeType: 'application/json', temperature: 0, abortSignal: opts.signal },
    });
    const text = resp.text ?? '';
    opts.onToken?.(text);
    return text;
  }

  async analyze(system: string, payload: object, opts: GenerateOptions = {}): Promise<string> {
    const ai = this.client();
    const resp = await ai.models.generateContent({
      model: this.insightModel,
      contents: [{ role: 'user', parts: [{ text: `Spending data:\n${JSON.stringify(payload)}` }] }],
      config: {
        systemInstruction: system,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        abortSignal: opts.signal,
      },
    });
    const text = resp.text ?? '';
    opts.onToken?.(text);
    return text;
  }

  private client(): GoogleGenAI {
    if (!this.ai) throw new AppError('MODE_UNAVAILABLE', 'Online mode needs a Gemini API key (Settings).');
    return this.ai;
  }
}
