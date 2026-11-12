import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

function accountOrigin(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))
  ) {
    throw new Error('Use an HTTPS guild API outside local development.');
  }
  return parsed.origin;
}

function clerkOrigin(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const encoded = /^pk_(?:live|test)_([A-Za-z0-9_-]+={0,2})$/.exec(key)?.[1];
  const domain = encoded && Buffer.from(encoded, 'base64url').toString('utf8');
  if (!domain || !/^[a-zA-Z0-9.-]+\$$/.test(domain))
    throw new Error('Invalid Clerk publishable key.');
  return `https://${domain.slice(0, -1)}`;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const buildPlugins = [];
  if (command === 'build') {
    const api = accountOrigin(env.VITE_API_URL);
    const clerk = clerkOrigin(env.VITE_CLERK_PUBLISHABLE_KEY);
    const sources = clerk
      ? [clerk, 'https://challenges.cloudflare.com', 'https://*.protect.clerk.com']
      : [];
    const websocket = api?.replace(/^http/, 'ws');
    const connect = [api, websocket, clerk, clerk && 'https://*.protect.clerk.com:*']
      .filter(Boolean)
      .join(' ');
    const policy = [
      "default-src 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "form-action 'self'",
      ["script-src 'self'", ...sources].join(' '),
      ["connect-src 'self'", connect].filter(Boolean).join(' '),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://img.clerk.com",
      "worker-src 'self' blob:",
      sources.length ? ['frame-src', ...sources].join(' ') : "frame-src 'none'",
    ].join('; ');
    buildPlugins.push({
      name: 'guild-content-security-policy',
      transformIndexHtml: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend' as const,
        },
      ],
    });
  }
  return {
    base: '/documentation-guild/',
    plugins: [react(), ...buildPlugins],
    build: { sourcemap: false },
  };
});
