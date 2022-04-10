const express = require('express');
const getPort = require('get-port');
const bodyParser = require('body-parser');
const asyncHandler = require('express-async-handler');
const basicAuth = require('express-basic-auth');
const cookieParser = require('cookie-parser');

const { uriifyPath } = require('./util');

const { readFrame, cleanupAll: cleanupVideoProcessors, readVideoStreamsMetadata } = require('./videoServer');

async function serve({ logger, ffmpegPath, ffprobePath, serveStaticPath, serveRoot, port: requestedPort, secret, enableRequestLogging = false }) {
  const app = express();

  app.use(cookieParser());

  if (enableRequestLogging) {
    app.use((req, res, next) => {
      logger.info('request', req.method, req.url);
      next();
    });
  }

  app.use((req, res, next) => {
    if (req.cookies['reactive-video-secret'] === secret) {
      next();
      return;
    }
    if (req.query.secret === secret) {
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
        if (['fps', 'width', 'height', 'scale', 'fileFps', 'time', 'streamIndex', 'renderId', 'jpegQuality'].includes(key)) return [key, val != null ? parseFloat(val) : undefined];
        return [key, val];
      }));
      const { ffmpegStreamFormat } = params;
      // console.log(params);
      const { stream, buffer } = await readFrame({ params, ffmpegPath, logger });
      if (ffmpegStreamFormat === 'png') {
        res.set({ 'content-type': 'image/png' });
        res.send(buffer);
      } else if (ffmpegStreamFormat === 'raw') {
        stream.pipe(res);
      } else if (ffmpegStreamFormat === 'jpeg') {
        res.set({ 'content-type': 'image/jpeg' });
        res.send(buffer);
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
    res.send(await readVideoStreamsMetadata({ ffprobePath, path: uri, streamIndex: req.body.streamIndex }));
  }));

  if (serveStaticPath) app.use(express.static(serveStaticPath));

  if (serveRoot) app.use('/root', express.static('/'));

  const port = requestedPort || await getPort();
  let server;
  await new Promise((resolve) => {
    server = app.listen(port, resolve);
  });

  const stop = () => {
    server.close();
    cleanupVideoProcessors();
  };
  return { port, stop };
}

module.exports = {
  serve,
};
