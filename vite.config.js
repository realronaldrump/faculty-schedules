import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const handlerModuleUrl = new URL('./api/export-ics.js', import.meta.url);

const buildDevApiMiddleware = () => ({
  name: 'export-ics-dev-middleware',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url || !req.url.startsWith('/api/export-ics')) {
        return next();
      }

      try {
        const requestUrl = new URL(req.url, 'http://localhost');
        const query = {};
        for (const key of requestUrl.searchParams.keys()) {
          const values = requestUrl.searchParams.getAll(key);
          query[key] = values.length > 1 ? values : values[0];
        }

        req.query = query;

        if (typeof res.status !== 'function') {
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
        }

        if (typeof res.json !== 'function') {
          res.json = (payload) => {
            if (!res.getHeader('Content-Type')) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
            }
            res.end(JSON.stringify(payload));
            return res;
          };
        }

        if (typeof res.send !== 'function') {
          res.send = (payload) => {
            if (payload instanceof Uint8Array || typeof payload === 'string') {
              res.end(payload);
            } else if (payload != null) {
              res.end(String(payload));
            } else {
              res.end();
            }
            return res;
          };
        }

        const moduleSpecifier = `${handlerModuleUrl}?t=${Date.now()}`;
        const { default: handler } = await import(moduleSpecifier);
        await handler(req, res);
      } catch (error) {
        console.error('Failed to handle /api/export-ics locally:', error);
        if (!res.headersSent) {
          res.statusCode = 500;
        }
        res.end('Internal Server Error');
      }
    });
  }
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), buildDevApiMiddleware()]
});
