export type VideoComponentType = 'html' | 'ffmpeg'

export type PuppeteerCaptureFormat = 'png' | 'jpeg';

export type CaptureMethod = 'screencast' | 'screenshot' | 'extension';

export type FFmpegStreamFormat = 'raw' | 'jpeg' | 'png';

export interface FfmpegBaseParams {
  fps: number,
  fileFps: number,
  uri: string,
  width: number,
  height: number,
  scale: boolean,
  streamIndex: number,
  ffmpegStreamFormat: FFmpegStreamFormat,
  jpegQuality?: number | undefined;
}

export interface FFmpegParams extends FfmpegBaseParams {
  time: number;
}

export interface API {
  getProxiedAssetUrl: (url: string) => string;
  getVideoFrameUrl: (params: FFmpegParams) => string;
  readVideoFrame: (params: FFmpegParams) => Promise<Response>;
  readVideoMetadata: (params: { path: string, streamIndex: number }) => Promise<Response>,
}
