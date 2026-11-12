import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { PRIVACY_HTML } from './functions/privacy.ts';
import { TERMS_HTML } from './functions/terms.ts';
import { applyWebAnalyticsToken } from './src/lib/webAnalyticsHtml.ts';

function webAnalyticsPlugin(): Plugin {
  return {
    name: 'ordboj-web-analytics',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return applyWebAnalyticsToken(html, process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN);
      },
    },
  };
}

// Vite does not run Pages Functions. This middleware serves the same HTML
// the Function returns, so local dev and Playwright match the deploy.
// It does not add a client route.
function privacyPagePlugin(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const pathname = req.url?.split('?')[0] ?? '';
    if (pathname !== '/privacy' && pathname !== '/privacy/') {
      next();
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(PRIVACY_HTML);
  };
  return {
    name: 'ordboj-privacy-page',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// Vite does not run Pages Functions. This middleware serves the same HTML
// the Function returns, so local dev and Playwright match the deploy.
// It does not add a client route.
function termsPagePlugin(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const pathname = req.url?.split('?')[0] ?? '';
    if (pathname !== '/terms' && pathname !== '/terms/') {
      next();
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(TERMS_HTML);
  };
  return {
    name: 'ordboj-terms-page',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: '::',
    port: 8080,
  },
  plugins: [webAnalyticsPlugin(), privacyPagePlugin(), termsPagePlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
  },
}));
