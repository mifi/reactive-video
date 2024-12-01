import { FFmpegStreamFormat } from 'reactive-video/dist/types.js';

export interface CreateFfmpegParams {
  fps: number,
  fileFps: number,
  uri: string,
  width: number,
  height: number,
  scale: number,
  streamIndex: number,
  ffmpegStreamFormat: FFmpegStreamFormat,
  jpegQuality: number,
}
