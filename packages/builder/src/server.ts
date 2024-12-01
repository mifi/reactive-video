import express, { NextFunction, Request, Response } from 'express';
import bodyParser from 'body-parser';
import asyncHandler from 'express-async-handler';
import basicAuth from 'express-basic-auth';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import assert from 'node:assert';
import { stat } from 'node:fs/promises';

import { uriifyPath } from './util.js';

import { readFrame, cleanupAll as cleanupVideoProcessors, readVideoStreamsMetadata } from './videoServer.js';
import type { Logger } from './index.js';

// In the future we may need to start multiple express servers if that becomes a bottleneck
export default async function serve({ logger, ffmpegPath, ffprobePath, serveStaticPath, serveRoot, port, secret, enableRequestLog = false }: {
  logger: Logger,
  ffmpegPath: string,
  ffprobePath: string,
  serveStaticPath?: string,
  serveRoot?: boolean,
  port: number,
  secret: string,
  enableRequestLog?: boolean,
}) {
  const app = express();

  app.use(cookieParser());

  if (enableRequestLog) {
    app.use(morgan('API :method :url :status :response-time ms - :res[content-length]', { stream: { write: (message) => logger.info(message.trim()) } }));
  }

  app.use((req, res, next) => {
    if (req.cookies['reactive-video-secret'] === secret) {
      next();
      return;
    }
    if (req.query['secret'] === secret) {
      res.cookie('reactive-video-secret', secret, { httpOnly: true });
      next();
      return;
    }
    basicAuth({ users: { 'reactive-video': secret } })(req, res, next);
  });

  app.use(bodyParser.json());

  // less cpu when disabled?
  app.set('etag', false);

  app.get('/api/frame', asyncHandler(async (req, res) => {
    try {
      const params = Object.fromEntries(Object.entries(req.query).map(([key, val]) => {
        if (['fps', 'width', 'height', 'fileFps', 'time', 'streamIndex', 'renderId', 'jpegQuality'].includes(key)) return [key, val != null && typeof val === 'string' ? parseFloat(val) : undefined];
        if (key === 'scale') return [key, val === 'true'];
        return [key, val];
      }));
      const { ffmpegStreamFormat } = params;
      // console.log(params);
      const ret = await readFrame({ params, ffmpegPath, logger });
      // eslint-disable-next-line unicorn/prefer-switch
      if (ffmpegStreamFormat === 'png') {
        res.set({ 'content-type': 'image/png' });
        assert('buffer' in ret);
        res.send(ret.buffer);
      } else if (ffmpegStreamFormat === 'raw') {
        assert('stream' in ret);
        ret.stream!.pipe(res);
      } else if (ffmpegStreamFormat === 'jpeg') {
        res.set({ 'content-type': 'image/jpeg' });
        assert('buffer' in ret);
        res.send(ret.buffer);
      } else {
        throw new Error('Invalid type');
      }
    } catch (err) {
      logger.error('Server read frame error', err);
      res.sendStatus(400);
    }
  }));

  app.post('/api/read-video-metadata', asyncHandler(async (req, res) => {
    const uri = uriifyPath(req.body.path);
    try {
      await stat(uri);
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        logger.error('File not found', uri);
        res.sendStatus(404);
        return;
      }
    }

    res.send(await readVideoStreamsMetadata({ ffprobePath, path: uri, streamIndex: req.body.streamIndex }));
  }));

  if (serveStaticPath) app.use(express.static(serveStaticPath));

  if (serveRoot) app.use('/root', express.static('/'));

  // must be last
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Request error', err);
    res.status(500).send('Internal server error');
  });

  let server: ReturnType<typeof app.listen>;
  await new Promise<void>((resolve) => {
    server = app.listen(port, resolve);
  });

  if (enableRequestLog) logger.info('HTTP server listening on port', port);

  const stop = async () => {
    logger.info('Stopping HTTP server');
    server.close();
    await cleanupVideoProcessors();
  };
  return { port, stop };
}
