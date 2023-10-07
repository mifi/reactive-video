const express = require('express');
const bodyParser = require('body-parser');
const asyncHandler = require('express-async-handler');
const basicAuth = require('express-basic-auth');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const { stat } = require('fs/promises');

const { uriifyPath } = require('./util');

const { readFrame, cleanupAll: cleanupVideoProcessors, readVideoStreamsMetadata } = require('./videoServer');

// In the future we may need to start multiple express servers if that becomes a bottleneck
async function serve({ logger, ffmpegPath, ffprobePath, serveStaticPath, serveRoot, port, secret, enableRequestLog = false }) {
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
        if (['fps', 'width', 'height', 'fileFps', 'time', 'streamIndex', 'renderId', 'jpegQuality'].includes(key)) return [key, val != null ? parseFloat(val) : undefined];
        if (key === 'scale') return [key, val === 'true'];
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
    try {
      await stat(uri);
    } catch (err) {
      if (err.code === 'ENOENT') {
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
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    logger.error('Request error', err);
    res.status(500).send('Internal server error');
  });

  let server;
  await new Promise((resolve) => {
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

module.exports = {
  serve,
};
