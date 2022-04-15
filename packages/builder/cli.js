#!/usr/bin/env node
const meow = require('meow');
const JSON5 = require('json5');
const debug = require('debug');
const log = require('debug')('reactive-video');

const Editor = require('./src');

// See also readme
const cli = meow(`
  Usage
    $ reactive-video <Video.js>
    Video.js is your React component file

  REQUIRED flags (one of these are required)
    --duration-frames, -f  Duration of the resulting video, in FRAMES
    --duration-time, -t  Duration of the resulting video, in SECONDS

  Options
    --output  Resulting video file name or path
    --width  Width of the resulting video
    --height  Height of the resulting video
    --fps  FPS of the resulting video

    --preview  Launch a browser live preview instead of editing
    --preview-html  HTML5 video previewing. Allows faster previews by using your browser's HTML5 video player

    --ffmpeg-path  Path to ffmpeg executable
    --ffprobe-path  Path to ffprobe executable
    --temp-dir  Temporary working directory where files will be built and hosted from
    --user-data  JSON data passed to React (can be JSON5)
    --concurrency  Divide rendering up into this many parts and run them in parallel
    --headless  Set to false to show the browser

  For more detailed explanation, see:
    https://github.com/mifi/reactive-video
`, {
  flags: {
    ffmpegPath: { type: 'string' },
    ffprobePath: { type: 'string' },
    devMode: { type: 'boolean' },

    preview: { type: 'boolean' },
    previewHtml: { type: 'boolean' },

    headless: { type: 'boolean', default: true },
    width: { type: 'number' },
    height: { type: 'number' },
    fps: { type: 'number' },
    userData: { type: 'string' },
    concurrency: { type: 'number' },

    captureMethod: { type: 'string' },
    frameRenderTimeout: { type: 'number' },

    durationFrames: { type: 'number', alias: 'f' },
    durationTime: { type: 'number', alias: 't' },

    tempDir: { type: 'string' },

    output: { type: 'string' },

    rawOutput: { type: 'boolean' },

    enableFrameCountCheck: { type: 'boolean' },

    verbose: { type: 'boolean', alias: 'v' },

    port: { type: 'number' },
  },
});

const reactVideo = cli.input[0];

const {
  preview, ffmpegPath, ffprobePath, devMode, userData: userDataStr, verbose, previewHtml, ...rest
} = cli.flags;

(async () => {
  if (verbose) debug.enable('reactive-video');

  if (cli.input.length !== 1 || (!cli.flags.durationTime && !cli.flags.durationFrames)) cli.showHelp();

  const editor = Editor({ ffmpegPath, ffprobePath, devMode });

  const userData = userDataStr && JSON5.parse(userDataStr);
  if (preview || previewHtml) {
    await editor.preview({
      reactVideo,
      userData,
      videoComponentType: previewHtml ? 'html' : undefined,
      ...rest,
    });
  } else {
    await editor.edit({
      reactVideo,
      userData,
      ...rest,
    });
  }
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Error:', err.message);
  log('Error', err);
  process.exitCode = 1;
});
