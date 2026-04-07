import { net } from 'electron';

type RequestOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

export function requestText(url: string, options: RequestOptions = {}): Promise<string> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const request = net.request(url);

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        request.abort();
        reject(new Error(`Request timed out after ${timeout}ms: ${url}`));
      }
    }, timeout);

    for (const [key, value] of Object.entries(options.headers ?? {})) {
      request.setHeader(key, value);
    }

    request.on('response', (response) => {
      const statusCode = response.statusCode;

      if (statusCode < 200 || statusCode >= 300) {
        clearTimeout(timer);
        settled = true;
        reject(new Error(`Request failed with status ${statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];

      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      response.on('end', () => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          resolve(Buffer.concat(chunks).toString('utf-8'));
        }
      });

      response.on('error', (err: Error) => {
        if (!settled) {
          clearTimeout(timer);
          settled = true;
          reject(err);
        }
      });
    });

    request.on('error', (err: Error) => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        reject(err);
      }
    });

    request.end();
  });
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const text = await requestText(url, options);
  return JSON.parse(text) as T;
}
