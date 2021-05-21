const stringify = require('json-stable-stringify');
const strtok3 = require('strtok3');
const execa = require('execa');
// const MjpegConsumer = require('mjpeg-consumer');
const pngSplitStream = require('png-split-stream');
const assert = require('assert');
const uri2path = require('file-uri-to-path');
const log = require('debug')('reactive-video');

const videoProcesses = {};

function createRawFfmpeg({ ffmpegPath, fps, uri, width, height, scale, fileFps, cutFrom, streamIndex, type }) {
  const fileFrameDuration = 1 / fileFps;

  const path = uri.startsWith('file://') ? uri2path(uri) : uri;

  const filters = [
    `fps=${fps}`,
  ];
  if (scale) filters.push(`scale=${width}:${height}`);

  const args = [
    '-hide_banner',
    // '-loglevel', 'panic',

    // Transparency
    // '-vcodec', 'libvpx',

    // It seems that if -ss is just a tiny fraction higher than the desired frame start time, ffmpeg will instead cut from the next frame. So we subtract a bit of the duration of the input file's frames
    '-ss', Math.max(0, cutFrom - (fileFrameDuration * 0.1)),

    '-noautorotate',

    '-i', path,

    '-an',

    '-vf', filters.join(','),
    '-map', `0:v:${streamIndex}`,

    ...(type === 'raw' ? [
      '-pix_fmt', 'rgba',
      '-vcodec', 'rawvideo',
    ] : []),

    ...(type === 'png' ? [
      '-pix_fmt', 'rgba',
      '-vcodec', 'png',
    ] : []),

    '-f', 'image2pipe',
    '-',
  ];

  // console.log(args);

  return execa(ffmpegPath, args, { encoding: null, buffer: false, stderr: 'ignore' });
}

function cleanupProcess(key) {
  if (!key) return;
  if (videoProcesses[key]) videoProcesses[key].process.kill();
  delete videoProcesses[key];
}

async function readFrame(props) {
  let process;
  let key;

  try {
    const { ffmpegPath, fps, uri, width, height, scale, fileFps, time = 0, streamIndex, type, renderId } = props;

    const frameDuration = 1 / fps;

    key = stringify({ fps, uri, width, height, scale, fileFps, streamIndex, type, renderId });

    // console.log(videoProcesses[key] && videoProcesses[key].time, time);

    // Assume half a frame is ok
    if (videoProcesses[key] && Math.abs(videoProcesses[key].time - time) < frameDuration * 0.5) {
      // OK, will reuse
      // console.log('Reusing ffmpeg');
      videoProcesses[key].time = time;
    } else {
      log('createRawFfmpeg', key);
      // console.log(videoProcesses[key] && videoProcesses[key].time, time);

      // Parameters changed (or time is not next frame). need to restart encoding
      cleanupProcess(key); // in case only time has changed, cleanup old process

      process = createRawFfmpeg({ ffmpegPath, fps, uri, width, height, scale, fileFps, cutFrom: time, streamIndex, type });

      let readNextFrame;
      if (type === 'raw') {
        const tokenizer = await strtok3.fromStream(process.stdout);
        const channels = 4;
        const frameByteSize = width * height * channels;
        const buf = Buffer.allocUnsafe(frameByteSize);

        // eslint-disable-next-line no-inner-declarations
        readNextFrame = async () => {
          await tokenizer.readBuffer(buf, { length: frameByteSize });
          return buf;
        };
      } else if (type === 'png') {
        const stream = process.stdout.pipe(pngSplitStream());
        stream.pause();

        readNextFrame = async () => new Promise((resolve, reject) => {
          function onError(err) {
            reject(err);
          }
          function onData(pngFrame) {
            // each 'data' event contains one of the frames from the video as a single chunk
            resolve(pngFrame);
            stream.pause();
            stream.off('error', onError);
          }

          stream.resume();
          stream.once('data', onData);
          stream.once('error', onError);
        });
      }

      videoProcesses[key] = {
        process,
        time,
        readNextFrame,
      };
    }

    const videoProcess = videoProcesses[key];

    const buf = await videoProcess.readNextFrame();

    videoProcess.time += frameDuration;

    return buf;
  } catch (err) {
    if (process) {
      try {
        await process;
      } catch (err2) {
        if (!err2.killed) {
          console.error('ffmpeg error', err2.message);
          cleanupProcess(key);
        }
      }
    }
    throw err;
  }
}

function cleanupAll() {
  Object.keys(videoProcesses).forEach((key) => cleanupProcess(key));
}

async function readVideoFormatMetadata({ ffprobePath, path }) {
  const { stdout } = await execa(ffprobePath, [
    '-of', 'json', '-show_entries', 'format', '-i', path,
  ]);

  const { format } = JSON.parse(stdout);

  let duration = parseFloat(format.duration);
  if (Number.isNaN(duration)) duration = undefined;

  return { duration };
}

async function readVideoStreamsMetadata({ ffprobePath, path, streamIndex }) {
  const { stdout } = await execa(ffprobePath, [
    '-of', 'json', '-show_entries', 'stream', '-i', path,
  ]);

  const { streams } = JSON.parse(stdout);
  const videoStreams = streams.filter((s) => s.codec_type === 'video');
  const stream = videoStreams[streamIndex];
  assert(stream, 'Stream not found');

  const { width, height, avg_frame_rate: avgFrameRate } = stream;
  const frameRateSplit = avgFrameRate.split('/');
  const frameRateCalculated = parseInt(frameRateSplit[0], 10) / parseInt(frameRateSplit[1], 10);
  const fps = Number.isNaN(frameRateCalculated) ? undefined : frameRateCalculated;

  return { width, height, fps };
}

async function readDurationFrames({ ffprobePath, path, streamIndex = 0 }) {
  const { stdout } = await execa(ffprobePath, ['-v', 'error', '-select_streams', `v:${streamIndex}`, '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', path]);
  return parseInt(stdout, 10);
}

module.exports = { readFrame, cleanupAll, readVideoStreamsMetadata, readVideoFormatMetadata, readDurationFrames };
