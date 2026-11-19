export const MAX_PORTRAIT_BYTES = 500_000;
/** Storage quotas, so one account cannot fill the database. */
export const MAX_PORTRAITS_PER_CAMPAIGN = 25;
export const MAX_PORTRAITS_PER_OWNER = 100;

export type PortraitContentType = 'image/jpeg' | 'image/png' | 'image/webp';

const startsWith = (bytes: Buffer, sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);

/** Identifies the image type from its leading bytes; the client's declared type is never trusted. */
export function sniffImage(bytes: Buffer): PortraitContentType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}
