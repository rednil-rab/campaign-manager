import { HttpError } from '../errors';
import { MAX_PORTRAIT_BYTES, sniffImage } from './image';

export interface GeneratedImage {
  contentType: string;
  bytes: Buffer;
}

export interface PortraitGenerator {
  generate(prompt: string): Promise<GeneratedImage>;
}

export const PORTRAIT_STYLE_PREFIX =
  'Fantasy tabletop RPG character portrait, head and shoulders, painterly illustration, no text or watermark. Character: ';

const ENDPOINT = 'https://api.openai.com/v1/images/generations';
const TIMEOUT_MS = 60_000;
const REFUSAL_CODES = new Set(['moderation_blocked', 'content_policy_violation']);

const providerFailed = () => new HttpError(502, 'The image provider could not generate a portrait. Please try again.');

export function createOpenAiGenerator(opts: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): PortraitGenerator {
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    async generate(prompt) {
      let res: Response;
      try {
        res = await doFetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
          body: JSON.stringify({
            model: opts.model,
            prompt: PORTRAIT_STYLE_PREFIX + prompt,
            n: 1,
            size: '1024x1024',
            quality: 'low',
            output_format: 'webp',
            output_compression: 80,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw providerFailed();
      }

      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
        if (res.status === 400 && typeof code === 'string' && REFUSAL_CODES.has(code)) {
          throw new HttpError(422, 'The image provider refused this prompt. Try describing the character differently.');
        }
        throw providerFailed();
      }

      const b64 = (body as { data?: { b64_json?: unknown }[] } | null)?.data?.[0]?.b64_json;
      if (typeof b64 !== 'string') throw providerFailed();
      const bytes = Buffer.from(b64, 'base64');
      const contentType = sniffImage(bytes);
      if (!contentType || bytes.length > MAX_PORTRAIT_BYTES) throw providerFailed();
      return { contentType, bytes };
    },
  };
}
