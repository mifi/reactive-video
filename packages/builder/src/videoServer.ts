import stringify from 'json-stable-stringify';
import execa, { ExecaChildProcess } from 'execa';
// @ts-expect-error todo
import pngSplitStream from 'png-split-stream';
import binarySplit from 'binary-split';
import { Readable } from 'node:stream';
import assert from 'node:assert';

import { FfmpegBaseParams, FFmpegParams, FFmpegStreamFormat } from 'reactive-video/dist/types.js';

import createSplitter from './splitStream.js';
import { uriifyPath } from './util.js';
import type { Logger } from './index.js';

const videoProcesses: Record<string, {
  process?: ExecaChildProcess<Buffer>,
  time?: number,
  busy?: boolean,
  readNextFrame?: () => Promise<{ buffer: Buffer } | { stream: Readable | undefined }>,
}> = {};

function createFfmpeg({ ffmpegPath, cutFrom, fps, uri: uriOrPath, width, height, scale, fileFps, streamIndex, ffmpegStreamFormat, jpegQuality }: FfmpegBaseParams & {
  ffmpegPath: string,
  cutFrom: number,
}) {
  const fileFrameDuration = 1 / fileFps;

  const uri = uriifyPath(uriOrPath);

  const filters = [
    `fps=${fps}`,
  ];
  if (scale) filters.push(`scale=${width}:${height}`);

  function getJpegQuality(percent: number) {
    const val = Math.max(Math.min(Math.round(2 + ((31 - 2) * (100 - percent)) / 100), 31), 2);
    return val;
  }

  const args = [
    '-hide_banner',
    // '-loglevel', 'panic',

    // Transparency
    // '-vcodec', 'libvpx',

    // It seems that if -ss is just a tiny fraction higher than the desired frame start time, ffmpeg will instead cut from the next frame. So we subtract a bit of the duration of the input file's frames
    '-ss', String(Math.max(0, cutFrom - (fileFrameDuration * 0.1))),

    '-noautorotate',

    '-i', uri,

    '-an',

    '-vf', filters.join(','),
    '-map', `0:v:${streamIndex}`,

    ...(ffmpegStreamFormat === 'raw' ? [
      '-pix_fmt', 'rgba',
      '-vcodec', 'rawvideo',
    ] : []),

    ...(ffmpegStreamFormat === 'png' ? [
      '-pix_fmt', 'rgba',
      '-vcodec', 'png',
    ] : []),

    ...(ffmpegStreamFormat === 'jpeg' ? [
      ...(jpegQuality != null ? ['-q:v', String(getJpegQuality(jpegQuality))] : []),
      '-pix_fmt', 'rgba',
      '-vcodec', 'mjpeg',
    ] : []),

    '-f', 'image2pipe',
    '-',
  ];

  // console.log(args.join(' '));

  return execa(ffmpegPath, args, { encoding: null, buffer: false, stderr: 'ignore' });
}

async function cleanupProcess(key: string) {
  if (!key) return undefined;
  const videoProcess = videoProcesses[key];
  if (videoProcess && videoProcess.process) {
    videoProcess.process.kill();
    delete videoProcesses[key]?.process;
  }
  return videoProcess && videoProcess.process;
}

function createFrameReader({ process, ffmpegStreamFormat, width, height }: {
  process: ExecaChildProcess<Buffer>,
  ffmpegStreamFormat: FFmpegStreamFormat,
  width: number,
  height: number,
}) {
  if (ffmpegStreamFormat === 'raw') {
    const channels = 4;
    const frameByteSize = width * height * channels;

    const { awaitNextSplit } = createSplitter({ readableStream: process.stdout!, splitOnLength: frameByteSize });

    return {
      readNextFrame: async () => ({ stream: await awaitNextSplit() }),
    };
  }

  if (ffmpegStreamFormat === 'jpeg') {
    const jpegSoi = Buffer.from([0xFF, 0xD8]); // JPEG start sequence
    const splitter = binarySplit(jpegSoi);

    const stream = process.stdout!.pipe(splitter);
    stream.pause();

    return {
      readNextFrame: async () => new Promise<{ buffer: Buffer }>((resolve, reject) => {
        function onError(err: unknown) {
          reject(err);
        }
        function onData(jpegFrameWithoutSoi: Buffer) {
          // each 'data' event contains one of the frames from the video as a single chunk
          // todo improve this
          const jpegFrame = Buffer.concat([jpegSoi, jpegFrameWithoutSoi]);
          resolve({ buffer: jpegFrame });
          stream.pause();
          stream.off('error', onError);
        }

        stream.resume();
        stream.once('data', onData);
        stream.once('error', onError);
      }),
    };
  }

  if (ffmpegStreamFormat === 'png') {
    const stream = process.stdout!.pipe(pngSplitStream());
    stream.pause();

    return {
      readNextFrame: async () => new Promise<{ buffer: Buffer }>((resolve, reject) => {
        function onError(err: unknown) {
          reject(err);
        }
        function onData(pngFrame: Buffer) {
          // each 'data' event contains one of the frames from the video as a single chunk
          resolve({ buffer: pngFrame });
          stream.pause();
          stream.off('error', onError);
        }

        stream.resume();
        stream.once('data', onData);
        stream.once('error', onError);
      }),
    };
  }

  throw new Error('Invalid ffmpegStreamFormat');
}

export async function readFrame({ params, ffmpegPath, logger }: {
  params: FFmpegParams,
  ffmpegPath: string,
  logger: Logger,
}) {
  let process: ExecaChildProcess<Buffer> | undefined;

  const { fps, uri, width, height, scale, fileFps, time = 0, streamIndex, ffmpegStreamFormat, jpegQuality } = params;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { time: ignored, ...allExceptTime } = params;
  const key = stringify(allExceptTime);

  // console.log(videoProcesses[key] && videoProcesses[key].time, time);

  if (!videoProcesses[key]) videoProcesses[key] = {};

  // without this check, it could lead to bugs if concurrent reads lead to overlapping readNextFrame calls
  // https://github.com/mifi/reactive-video/issues/12
  if (videoProcesses[key]!.busy) throw new Error(`Busy processing previous frame: ${key} ${time}`);

  // if (Math.random() < 0.2) throw new Error('Test error');

  videoProcesses[key]!.busy = true;

  try {
    const frameDuration = 1 / fps;

    // Assume up to half a frame off is the same frame
    const isSameFrame = (time1: number, time2: number) => Math.abs(time1 - time2) < frameDuration * 0.5;

    const { time: processTime } = videoProcesses[key]!;
    if (processTime != null && isSameFrame(processTime, time)) {
      // console.log('Reusing ffmpeg');
      videoProcesses[key]!.time = time; // prevent the times from drifting apart
    } else {
      logger.log('createFfmpeg', key, time);
      // console.log({ processTime: videoProcesses[key] ? videoProcesses[key].time : undefined, time, frameDuration });

      // Parameters changed (or time is not next frame). need to restart encoding
      cleanupProcess(key); // in case only time has changed, cleanup old process

      process = createFfmpeg({ ffmpegPath, fps, uri, width, height, scale, fileFps, cutFrom: time, streamIndex, ffmpegStreamFormat, jpegQuality });

      const { readNextFrame } = createFrameReader({ process, ffmpegStreamFormat, width, height });

      videoProcesses[key] = {
        ...videoProcesses[key],
        process,
        time,
        readNextFrame: async () => Promise.race([readNextFrame(), new Promise<never>((_resolve, reject) => process!.catch(reject))]),
      };
    }

    const videoProcess = videoProcesses[key];

    videoProcess!.time = (videoProcess!.time ?? 0) + frameDuration;

    const frame = await videoProcess!.readNextFrame!();

    return frame;
  } catch (err) {
    if (process) {
      try {
        await process;
      } catch (err2) {
        if (!(err2 instanceof Error && 'killed' in err2 && err2.killed)) {
          logger.error('ffmpeg error', (err2 as Error).message);
          cleanupProcess(key);
        }
      }
    }
    throw err;
  } finally {
    videoProcesses[key]!.busy = false;
  }
}

export async function cleanupAll() {
  await Promise.allSettled(Object.keys(videoProcesses).map((key) => cleanupProcess(key)));
}

export async function readVideoFormatMetadata({ ffprobePath, path }: { ffprobePath: string, path: string }) {
  const { stdout } = await execa(ffprobePath, [
    '-of', 'json', '-show_entries', 'format', '-i', path,
  ]);

  const { format } = JSON.parse(stdout);

  let duration: number | undefined = parseFloat(format.duration);
  if (Number.isNaN(duration)) duration = undefined;

  return { duration };
}

export async function readVideoStreamsMetadata({ ffprobePath, path, streamIndex }: {
  ffprobePath: string,
  path: string,
  streamIndex: number,
}) {
  const { stdout } = await execa(ffprobePath, [
    '-of', 'json', '-show_entries', 'stream', '-i', path,
  ]);

  const { streams }: { streams: { codec_type: string, avg_frame_rate: string, width: number, height: number }[] } = JSON.parse(stdout);
  const videoStreams = streams.filter((s) => s.codec_type === 'video');
  const stream = videoStreams[streamIndex];
  assert(stream, 'Stream not found');

  const { width, height, avg_frame_rate: avgFrameRate } = stream;
  const frameRateSplit = avgFrameRate.split('/');
  const frameRateCalculated = parseInt(frameRateSplit[0]!, 10) / parseInt(frameRateSplit[1]!, 10);
  const fps = Number.isNaN(frameRateCalculated) ? undefined : frameRateCalculated;

  return { width, height, fps };
}

export async function readDurationFrames({ ffprobePath, path, streamIndex = 0 }: {
  ffprobePath: string,
  path: string,
  streamIndex?: number,
}) {
  const { stdout } = await execa(ffprobePath, ['-v', 'error', '-select_streams', `v:${streamIndex}`, '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', path]);
  return parseInt(stdout, 10);
}
