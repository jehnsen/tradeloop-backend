import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/http/app.exception';

const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/png': (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
};

export const ALLOWED_MIME_TYPES = Object.keys(SIGNATURES);

export const EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

/** Validates declared MIME type against an allow-list and the file's magic bytes. */
export function assertAllowedFile(mimeType: string, buffer: Buffer, maxBytes: number): void {
  if (!buffer.length) throw new AppException(HttpStatus.BAD_REQUEST, 'EMPTY_FILE', 'File is empty');
  if (buffer.length > maxBytes) {
    throw new AppException(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'FILE_TOO_LARGE',
      `File exceeds ${maxBytes} bytes`,
    );
  }
  const matches = SIGNATURES[mimeType];
  if (!matches) {
    throw new AppException(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      'UNSUPPORTED_FILE_TYPE',
      `Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
    );
  }
  if (!matches(buffer)) {
    throw new AppException(
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      'FILE_TYPE_MISMATCH',
      'File content does not match its declared type',
    );
  }
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return (cleaned || 'file').slice(0, 255);
}
