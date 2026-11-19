import { describe, expect, it } from 'vitest';
import { sniffImage } from './image';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

describe('sniffImage', () => {
  it('recognises jpeg, png and webp by magic bytes', () => {
    expect(sniffImage(jpeg)).toBe('image/jpeg');
    expect(sniffImage(png)).toBe('image/png');
    expect(sniffImage(webp)).toBe('image/webp');
  });

  it('rejects svg, html, riff that is not webp, empty and random bytes', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WAVEfmt ')]))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
    expect(sniffImage(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });
});
