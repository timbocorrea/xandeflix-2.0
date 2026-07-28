import { once } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const LOCAL_PLAYLIST_PROXY_PATH =
  '/__xandeflix/dev/playlist';
const MAX_LOCAL_PROXY_BODY_BYTES = 64 * 1024;

const viteCacheDir = path.join(
  process.env.LOCALAPPDATA ?? os.tmpdir(),
  'xandeflix2-vite-cache',
);

type LocalPlaylistProxyPayload = {
  sourceUrl?: unknown;
  upstreamMethod?: unknown;
};

function sendLocalProxyError(
  response: ServerResponse,
  statusCode: number,
  errorCode: string,
) {
  if (response.headersSent) {
    response.destroy();
    return;
  }

  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify({ error: errorCode }));
}

async function readLocalProxyPayload(
  request: IncomingMessage,
): Promise<LocalPlaylistProxyPayload> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);

    totalBytes += buffer.byteLength;

    if (totalBytes > MAX_LOCAL_PROXY_BODY_BYTES) {
      throw new Error('LOCAL_PLAYLIST_PROXY_BODY_TOO_LARGE');
    }

    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(rawBody) as LocalPlaylistProxyPayload;
}

function validateSameOriginRequest(request: IncomingMessage) {
  const origin = request.headers.origin;
  const host = request.headers.host;

  if (!origin || !host) {
    return true;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function normalizeLocalProxySourceUrl(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('LOCAL_PLAYLIST_PROXY_URL_INVALID');
  }

  const sourceUrl = new URL(value.trim());

  if (
    sourceUrl.protocol !== 'http:' &&
    sourceUrl.protocol !== 'https:'
  ) {
    throw new Error('LOCAL_PLAYLIST_PROXY_PROTOCOL_INVALID');
  }

  return sourceUrl.toString();
}

function normalizeUpstreamMethod(value: unknown): 'GET' | 'HEAD' {
  if (value === 'GET' || value === 'HEAD') {
    return value;
  }

  throw new Error('LOCAL_PLAYLIST_PROXY_METHOD_INVALID');
}

function copyUpstreamHeaders(
  upstreamResponse: Response,
  response: ServerResponse,
  includeContentLength: boolean,
) {
  const allowedHeaders = [
    'accept-ranges',
    'content-type',
    'etag',
    'last-modified',
  ];

  if (includeContentLength) {
    allowedHeaders.push('content-length');
  }

  for (const headerName of allowedHeaders) {
    const value = upstreamResponse.headers.get(headerName);

    if (value) {
      response.setHeader(headerName, value);
    }
  }

  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

async function streamUpstreamResponse(
  upstreamResponse: Response,
  response: ServerResponse,
) {
  if (!upstreamResponse.body) {
    response.end();
    return;
  }

  const reader = upstreamResponse.body.getReader();

  while (true) {
    const chunk = await reader.read();

    if (chunk.done) {
      break;
    }

    if (!response.write(chunk.value)) {
      await once(response, 'drain');
    }
  }

  response.end();
}

function localPlaylistProxyPlugin(): Plugin {
  return {
    name: 'xandeflix-local-playlist-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(
        LOCAL_PLAYLIST_PROXY_PATH,
        async (request, response) => {
          if (request.method !== 'POST') {
            sendLocalProxyError(
              response,
              405,
              'LOCAL_PLAYLIST_PROXY_METHOD_NOT_ALLOWED',
            );
            return;
          }

          if (!validateSameOriginRequest(request)) {
            sendLocalProxyError(
              response,
              403,
              'LOCAL_PLAYLIST_PROXY_ORIGIN_REJECTED',
            );
            return;
          }

          const controller = new AbortController();
          const abortUpstream = () => controller.abort();

          request.once('aborted', abortUpstream);
          response.once('close', abortUpstream);

          try {
            const payload = await readLocalProxyPayload(request);
            const sourceUrl = normalizeLocalProxySourceUrl(
              payload.sourceUrl,
            );
            const upstreamMethod = normalizeUpstreamMethod(
              payload.upstreamMethod,
            );

            const upstreamResponse = await fetch(sourceUrl, {
              method: upstreamMethod,
              cache: 'no-store',
              redirect: 'follow',
              signal: controller.signal,
              headers: {
                Accept:
                  'application/vnd.apple.mpegurl, application/x-mpegURL, audio/mpegurl, text/plain, */*',
                'User-Agent': 'Xandeflix-Local-Dev-Proxy/1.0',
              },
            });

            response.statusCode = upstreamResponse.status;

            const shouldStreamBody =
              upstreamMethod === 'GET' &&
              upstreamResponse.ok;

            copyUpstreamHeaders(
              upstreamResponse,
              response,
              shouldStreamBody,
            );

            if (upstreamMethod === 'HEAD') {
              const upstreamContentLength =
                upstreamResponse.headers.get('content-length');

              if (upstreamContentLength) {
                response.setHeader(
                  'X-Xandeflix-Upstream-Content-Length',
                  upstreamContentLength,
                );
              }
            }

            if (!shouldStreamBody) {
              response.setHeader('Content-Length', '0');
              response.end();
              return;
            }

            await streamUpstreamResponse(
              upstreamResponse,
              response,
            );
          } catch (error) {
            if (
              error instanceof Error &&
              error.name === 'AbortError'
            ) {
              if (!response.writableEnded) {
                response.destroy();
              }
              return;
            }

            sendLocalProxyError(
              response,
              502,
              error instanceof Error &&
                /^LOCAL_PLAYLIST_PROXY_[A-Z0-9_]+$/.test(
                  error.message,
                )
                ? error.message
                : 'LOCAL_PLAYLIST_PROXY_UPSTREAM_FAILED',
            );
          } finally {
            request.off('aborted', abortUpstream);
            response.off('close', abortUpstream);
          }
        },
      );
    },
  };
}

export default defineConfig({
  cacheDir: viteCacheDir,
  base: './',
  plugins: [
    localPlaylistProxyPlugin(),
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
