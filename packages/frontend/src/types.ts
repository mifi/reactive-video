export type UserData = object

export type VideoComponentType = 'html' | 'ffmpeg'

export type PuppeteerCaptureFormat = 'png' | 'jpeg';

export type CaptureMethod = 'screencast' | 'screenshot' | 'extension';

export type FFmpegStreamFormat = 'raw' | 'jpeg' | 'png';

export interface FFmpegParams {
  fps: number;
  uri: string;
  width: number;
  height: number;
  fileFps: number;
  scale: boolean;
  time: number;
  streamIndex: number;
  ffmpegStreamFormat: FFmpegStreamFormat;
  jpegQuality: number;
}

export interface API {
  getProxiedAssetUrl: (url: string) => string;
  getVideoFrameUrl: (params: FFmpegParams) => string;
  readVideoFrame: (params: FFmpegParams) => Promise<Response>;
  readVideoMetadata: (params: { path: string, streamIndex: number }) => Promise<Response>,
}
