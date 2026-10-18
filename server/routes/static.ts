// Static-Serving von dist/client mit Cache-Headern, SPA-Fallback und OG-Injection (SPEC §3.3 „Static und SPA“).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Ctx } from '../app.ts';
import { err } from '../services/errors.ts';
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, SITE_DESCRIPTION, injectOg, ogDescription } from '../services/og.ts';
import { APP_PATH_WITH_DOT, legacyRedirect, paths } from '../../shared/routes.ts';

const HAS_EXT = /\/[^/]*\.[A-Za-z0-9]+$/;
const GAME_PATH = /^\/bet\/(\d{1,15})(?:\/[^/]*)?\/?$/;

export async function staticRoutes(app: FastifyInstance, ctx: Ctx): Promise<void> {
  const dir = ctx.config.staticDir;
  const indexFile = join(dir, 'index.html');
  const hasClient = existsSync(indexFile);

  if (hasClient) {
    await app.register(fastifyStatic, {
      root: dir,
      prefix: '/',
      index: false,
      wildcard: true,
      cacheControl: false,
      dotfiles: 'ignore',
      setHeaders(reply, path) {
        const p = path.replace(/\\/g, '/');
        if (p.includes('/assets/')) reply.header('cache-control', 'public, max-age=31536000, immutable');
        else if (p.endsWith('/sw.js')) {
          reply.header('cache-control', 'no-cache');
          reply.header('service-worker-allowed', '/');
        } else if (p.endsWith('/index.html') || p.endsWith('.webmanifest')) reply.header('cache-control', 'no-cache');
        else reply.header('cache-control', 'public, max-age=86400');
        if (p.endsWith('.webmanifest')) reply.header('content-type', 'application/manifest+json; charset=utf-8');
      },
    });
  }

  // index.html einmal lesen; neu lesen, wenn sich die Datei ändert (neuer Build ohne Neustart)
  let cached: { mtime: number; html: string } | null = null;
  function indexHtml(): string | null {
    if (!existsSync(indexFile)) return null;
    const mtime = statSync(indexFile).mtimeMs;
    if (!cached || cached.mtime !== mtime) cached = { mtime, html: readFileSync(indexFile, 'utf8') };
    return cached.html;
  }

  function spa(req: FastifyRequest, reply: FastifyReply) {
    const html = indexHtml();
    if (!html) return reply.code(404).send(err.notFound().toJSON());
    const path = req.url.split('?')[0] ?? '/';
    const base = ctx.config.publicUrl;
    let og = { title: DEFAULT_TITLE, description: SITE_DESCRIPTION, url: base + (path === '/' ? '/' : path), image: `${base}/icons/og.png`, pageTitle: undefined as string | undefined };
    const m = GAME_PATH.exec(path);
    if (m) {
      const game = ctx.repo.getGame(Number(m[1]));
      if (game && !game.deletedAt) {
        const tips = ctx.repo.activeTips(game.id).length;
        og = {
          title: game.prompt,
          description: ogDescription(game, tips, { now: ctx.clock.now(), timeZone: ctx.config.displayTz }),
          url: base + paths.bet(game.id),
          image: `${base}/icons/og.png`,
          pageTitle: `${game.prompt} – BenchBet`,
        };
      } else {
        og.description = DEFAULT_DESCRIPTION;
      }
    }
    return reply
      .code(200)
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-cache')
      .send(injectOg(html, og));
  }

  // „/“ explizit (sonst landet es als Verzeichnis beim Static-Plugin)
  app.get('/', (req, reply) => spa(req, reply));

  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split('?')[0] ?? '/';
    const isGet = req.method === 'GET' || req.method === 'HEAD';
    if (isGet && !path.startsWith('/api/') && path !== '/api' && (!HAS_EXT.test(path) || APP_PATH_WITH_DOT.test(path))) {
      // Alte deutsche Pfade (/spiel/:id, /rangliste, …) dauerhaft auf die englischen umleiten
      const to = legacyRedirect(path, req.url.slice(path.length));
      if (to) return reply.header('cache-control', 'public, max-age=86400').redirect(to, 301);
      return spa(req, reply);
    }
    return reply.code(404).send(err.notFound().toJSON());
  });
}
