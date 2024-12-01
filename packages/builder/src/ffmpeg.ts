import { writeFile } from 'node:fs/promises';
import execa from 'execa';

export const getCodecArgs = ({ remuxOnly }: { remuxOnly: boolean }) => (remuxOnly ? [
  '-c', 'copy',
] : [
  '-c:v', 'libx264',
  '-crf', '17', // Visually "lossless"
  '-preset:v', 'ultrafast', // We don't care about file size here, but speed 🔥
]);

export async function concatParts({ ffmpegPath, paths, concatFilePath, finalOutPath, remuxOnly }: {
  ffmpegPath: string,
  paths: string[],
  concatFilePath: string,
  finalOutPath: string,
  remuxOnly: boolean,
}) {
  // https://superuser.com/questions/787064/filename-quoting-in-ffmpeg-concat
  const concatTxt = paths.map((path) => `file '${path.replaceAll('\'', "'\\''")}'`).join('\n');
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
export function createOutputFfmpeg({ puppeteerCaptureFormat, customOutputFfmpegArgs, ffmpegPath, fps, outPath, log = false }: {
  puppeteerCaptureFormat: string,
  customOutputFfmpegArgs?: string[] | undefined,
  ffmpegPath: string,
  fps: number,
  outPath: string,
  log?: boolean,
}) {
  return execa(ffmpegPath, [
    '-f', 'image2pipe', '-r', String(fps),
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
