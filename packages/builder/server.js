const express = require('express');
const getPort = require('get-port');
const bodyParser = require('body-parser');
const asyncHandler = require('express-async-handler');
const uri2path = require('file-uri-to-path');
const basicAuth = require('express-basic-auth');
const cookieParser = require('cookie-parser');

const { readFrame, cleanupAll: cleanupVideoProcessors, readVideoStreamsMetadata } = require('./videoServer');

async function serve({ ffmpegPath, ffprobePath, serveStaticPath, serveRoot, port: requestedPort, secret }) {
  const app = express();

  app.use(cookieParser());

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

  app.post('/api/read-frame', asyncHandler(async (req, res) => {
    try {
      const frame = await readFrame({ ...req.body, ffmpegPath });
      if (req.body.type === 'png') res.set({ 'content-type': 'image/png' });
      res.send(frame);
    } catch (err) {
      console.error('Server read frame error', err);
      res.sendStatus(400);
    }
  }));

  app.post('/api/read-video-metadata', asyncHandler(async (req, res) => {
    const protocol = req.body.path.substr(0, 4);

    if (protocol === 'file') {
      const path = uri2path(req.body.path);
      res.send(await readVideoStreamsMetadata({ ffprobePath, path, streamIndex: req.body.streamIndex }));
    } else {
      res.send(await readVideoStreamsMetadata({ ffprobePath, path: req.body.path, streamIndex: req.body.streamIndex }));
    }
  }));

  app.get('/api/proxy-video', async (req, res) => {
    const { uri } = req.query;
    const path = uri2path(uri);
    res.type(path).sendFile(path);
  });

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
