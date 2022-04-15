const { writeFile } = require('fs').promises;
const execa = require('execa');

const getCodecArgs = ({ remuxOnly }) => (remuxOnly ? [
  '-c', 'copy',
] : [
  '-c:v', 'libx264',
  '-crf', '17', // Visually "lossless"
  '-preset:v', 'ultrafast', // We don't care about file size here, but speed 🔥
]);

async function concatParts({ ffmpegPath, paths, concatFilePath, finalOutPath, remuxOnly }) {
  // https://superuser.com/questions/787064/filename-quoting-in-ffmpeg-concat
  const concatTxt = paths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(concatFilePath, concatTxt);

  await execa(ffmpegPath, [
    // https://blog.yo1.dog/fix-for-ffmpeg-protocol-not-on-whitelist-error-for-urls/
    '-f', 'concat', '-safe', '0', '-protocol_whitelist', 'file,pipe',
    '-i', concatFilePath,

    '-threads', '0',

    ...getCodecArgs({ remuxOnly }),

    // '-vf', 'scale=1920:-2',

    '-movflags', '+faststart',
    '-y', finalOutPath,
  ]);
}

// https://superuser.com/questions/585798/ffmpeg-slideshow-piping-input-and-output-for-image-stream
function createOutputFfmpeg({ puppeteerCaptureFormat, customOutputFfmpegArgs, ffmpegPath, fps, outPath, log = false }) {
  return execa(ffmpegPath, [
    '-f', 'image2pipe', '-r', fps,
    ...(puppeteerCaptureFormat === 'jpeg' ? ['-c:v', 'mjpeg'] : ['-c:v', 'png']),
    '-i', '-',

    // This can used to test/trigger the process hanging if stdout/stderr streams are not read (causes EPIPE)
    // '-loglevel', 'trace',

    ...(customOutputFfmpegArgs || getCodecArgs({ remuxOnly: true })),

    '-y', outPath,
  ], {
    encoding: null, buffer: false, stdin: 'pipe', stdout: log ? process.stdout : 'ignore', stderr: log ? process.stderr : 'ignore',
  });
}

module.exports = {
  getCodecArgs,
  concatParts,
  createOutputFfmpeg,
};
