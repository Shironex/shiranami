import { net } from 'electron';
import * as fs from 'fs';

/**
 * Download a URL to a file using electron's `net.request`, which handles
 * redirects and system proxy settings automatically. Reports progress via
 * the optional callback when Content-Length is known.
 */
export function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = net.request(url);

    request.on('response', (response) => {
      // Follow redirects are handled automatically by net.request
      const statusCode = response.statusCode;

      if (statusCode < 200 || statusCode >= 300) {
        reject(new Error(`Download failed with status ${statusCode}`));
        return;
      }

      const contentLength = parseInt(
        response.headers['content-length'] as string,
        10
      );
      let downloaded = 0;

      const writeStream = fs.createWriteStream(destPath);

      response.on('data', (chunk: Buffer) => {
        writeStream.write(chunk);
        downloaded += chunk.length;
        if (contentLength > 0 && onProgress) {
          const percent = Math.min(
            100,
            Math.round((downloaded / contentLength) * 100)
          );
          onProgress(percent);
        }
      });

      response.on('end', () => {
        writeStream.end(() => {
          resolve();
        });
      });

      response.on('error', (err: Error) => {
        writeStream.destroy();
        reject(err);
      });

      writeStream.on('error', (err: Error) => {
        reject(err);
      });
    });

    request.on('error', (err: Error) => {
      reject(err);
    });

    request.end();
  });
}
