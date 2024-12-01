#!/usr/bin/env node
import meow from 'meow';
import JSON5 from 'json5';
import debug from 'debug';
import assert from 'node:assert';

import Editor from './index.js';

const log = debug('reactive-video');

// See also readme
const cli = meow(`
  Usage
    $ reactive-video <Video.js>
    Video.js is your React component file

  REQUIRED flags (one of these are required)
    --duration-frames, -f  Duration of the resulting video, in FRAMES
    --duration-time, -t  Duration of the resulting video, in SECONDS
    --browser-exe-path  Path to browser executable

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
    browserExePath: { type: 'string' },
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
assert(reactVideo);

const {
  preview, ffmpegPath, ffprobePath, devMode, userData: userDataStr, verbose, previewHtml, browserExePath, captureMethod, ...rest
} = cli.flags;

try {
  if (verbose) debug.enable('reactive-video');

  if (cli.input.length !== 1 || (!cli.flags.durationTime && !cli.flags.durationFrames)) cli.showHelp();

  assert(browserExePath);
  const editor = Editor({ ffmpegPath, ffprobePath, browserExePath, devMode });

  const userData = userDataStr && JSON5.parse(userDataStr);
  if (preview || previewHtml) {
    await editor.preview({
      reactVideo,
      userData,
      videoComponentType: previewHtml ? 'html' : undefined,
      ...rest,
    });
  } else {
    assert(captureMethod == null || captureMethod === 'screencast' || captureMethod === 'screenshot' || captureMethod === 'extension');
    await editor.edit({
      reactVideo,
      userData,
      ...rest,
    });
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Error:', err instanceof Error ? err.message : err);
  log('Error', err);
  process.exitCode = 1;
}
