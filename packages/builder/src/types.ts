import { PuppeteerCaptureFormat, CaptureMethod, FFmpegStreamFormat, VideoComponentType } from 'reactive-video/dist/types';

interface Logger {
  error: (a: unknown) => void,
  warn: (a: unknown) => void,
  info: (a: unknown) => void,
  log: (a: unknown) => void,
  debug: (a: unknown) => void,
  trace: (a: unknown) => void,
}

interface CommonParams {
  width?: number,
  height?: number,
  fps?: number,
  userData: object,
  videoComponentType: VideoComponentType,
  ffmpegStreamFormat?: FFmpegStreamFormat,
  jpegQuality?: number,
  durationFrames?: number,
  durationTime?: number,
  reactVideo: string,
  tempDir?: string,
}

export interface PreviewParams extends CommonParams {
  port?: number,
}

export interface EditParams extends CommonParams {
  concurrency?: number,
  puppeteerCaptureFormat?: PuppeteerCaptureFormat,
  captureMethod?:CaptureMethod,
  sleepTimeBeforeCapture?: number,
  extraPuppeteerArgs?: Record<string, string>,
  customOutputFfmpegArgs?: Record<string, string>,

  startFrame?: number,

  // Output video path
  output?: string,

  rawOutput?: boolean,

  frameRenderTimeout?: number,
  failOnWebErrors?: boolean,
  numRetries?: number,

  enableFrameCountCheck?: boolean,

  showProgress?: boolean,

  headless?: boolean,
  keepBrowserRunning?: boolean,
  enableFfmpegLog?: boolean,
  enablePerFrameLog?: boolean,
  enableRequestLog?: boolean,
}

export interface EditorParams {
  ffmpegPath?: string,
  ffprobePath?: string,
  browserExePath: string,
  devMode?: boolean,
  logger?: Logger,
}

export interface ReadVideoMetadataParams {
  path: string;
  streamIndex?: number
  countFrames?: boolean
}
