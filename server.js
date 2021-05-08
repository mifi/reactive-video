const express = require('express');
const getPort = require('get-port');
const bodyParser = require('body-parser');
const asyncHandler = require('express-async-handler');

const { readFrame, cleanupAll: cleanupVideoProcessors, readVideoStreamsMetadata } = require('./videoServer');

async function serve({ ffmpegPath, ffprobePath, serveStaticPath, port: requestedPort }) {
  const app = express();
  app.use(bodyParser.json());

  app.post('/api/read-frame', asyncHandler(async (req, res) => {
    try {
      const frame = await readFrame({ ...req.body, ffmpegPath });
      if (req.body.type === 'png') res.set({ 'content-type': 'image/png' });
      res.send(frame);
    } catch (err) {
      console.log(err.message);
      res.send(400);
    }
  }));

  app.post('/api/read-video-metadata', asyncHandler(async (req, res) => {
    res.send(await readVideoStreamsMetadata({ ffprobePath, path: req.body.path, streamIndex: req.body.streamIndex }));
  }));

  if (serveStaticPath) app.use(express.static(serveStaticPath));

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
