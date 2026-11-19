import { describe, expect, it } from 'vitest';
import { HttpError } from '../errors';
import { createOpenAiGenerator, PORTRAIT_STYLE_PREFIX } from './generator';
import { MAX_PORTRAIT_BYTES } from './image';

const KEY = 'sk-secret-test-key';
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (bytes: Buffer) => json(200, { data: [{ b64_json: bytes.toString('base64') }] });

function setup(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;
  return { calls, generator: createOpenAiGenerator({ apiKey: KEY, model: 'gpt-image-1-mini', fetchImpl }) };
}

const failure = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => e)) as HttpError;

describe('createOpenAiGenerator', () => {
  it('returns the decoded image with its sniffed type', async () => {
    const { generator } = setup(() => ok(webp));
    const image = await generator.generate('a dwarf');
    expect(image.contentType).toBe('image/webp');
    expect(image.bytes).toEqual(webp);
  });

  it('sends the key, model, webp output and a prompt with the style prefix', async () => {
    const { generator, calls } = setup(() => ok(webp));
    await generator.generate('a dwarf with a red beard');
    expect(calls[0].url).toBe('https://api.openai.com/v1/images/generations');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ model: 'gpt-image-1-mini', size: '1024x1024', quality: 'low', output_format: 'webp', n: 1 });
    expect(body.output_compression).toBeLessThanOrEqual(100);
    expect(body).not.toHaveProperty('response_format');
    expect(body.prompt.startsWith(PORTRAIT_STYLE_PREFIX)).toBe(true);
    expect(body.prompt).toContain('a dwarf with a red beard');
  });

  it('maps a content-policy refusal to 422', async () => {
    const { generator } = setup(() => json(400, { error: { code: 'moderation_blocked', message: 'blocked: secret details' } }));
    const err = await failure(generator.generate('x'));
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(422);
    expect(err.message).not.toContain('secret details');
  });

  it('maps provider failures, network errors and timeouts to 502 without leaking the key or body', async () => {
    const cases: (() => Response | Promise<Response>)[] = [
      () => json(500, { error: { message: `boom ${KEY}` } }),
      () => json(401, { error: { message: 'bad key sk-secret-test-key' } }),
      () => {
        throw new Error(`network down ${KEY}`);
      },
      () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    ];
    for (const respond of cases) {
      const { generator } = setup(respond);
      const err = await failure(generator.generate('x'));
      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(502);
      expect(err.message).not.toContain(KEY);
    }
  });

  it('rejects results that are too large, not an image, or missing', async () => {
    const big = Buffer.concat([webp, Buffer.alloc(MAX_PORTRAIT_BYTES)]);
    for (const respond of [() => ok(big), () => ok(Buffer.from('<svg></svg>')), () => json(200, { data: [] })]) {
      const { generator } = setup(respond);
      expect((await failure(generator.generate('x'))).status).toBe(502);
    }
  });
});
