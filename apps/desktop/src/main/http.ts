import { net } from 'electron';

type RequestOptions = {
  headers?: Record<string, string>;
};

export function requestText(url: string, options: RequestOptions = {}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const request = net.request(url);

    for (const [key, value] of Object.entries(options.headers ?? {})) {
      request.setHeader(key, value);
    }

    request.on('response', (response) => {
      const statusCode = response.statusCode;

      if (statusCode < 200 || statusCode >= 300) {
        reject(new Error(`Request failed with status ${statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];

      response.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      response.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });

      response.on('error', (err: Error) => {
        reject(err);
      });
    });

    request.on('error', (err: Error) => {
      reject(err);
    });

    request.end();
  });
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const text = await requestText(url, options);
  return JSON.parse(text) as T;
}
