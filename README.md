<div align="center">
	<br>
	<br>
  <p><img src="logo.png" alt="Reactive Video" /></a></p>
    <a href="https://github.com/mifi/lossless-cut#download"><img src="https://img.shields.io/npm/v/reactive-video" /></a> <a href="https://paypal.me/mifino/usd"><img src="https://img.shields.io/badge/Donate-PayPal-green.svg" /></a>
	<br>
	<br>
	<br>
</div>

Reactive Videos are videos created using HTML and React components. This allows you to leverage the almost limitless possibilities of the web browser to render dynamic content into a video file.

## How does it work?

Reactive Video fires up one or more Puppeteer/Chromium tabs to render the React component hierarchy and rapidly capture screenshots for each frame when they are done rendering. It starts a HTTP server on `localhost` serving files (videos, images etc) needed to the Puppeteer client (protected by a token.)

## Features

- Edit videos with code! 🤓
- Full power of the web
- Parallel rendering with [multiple browsers](https://docs.browserless.io/blog/2018/06/04/puppeteer-best-practices.html#4-parallelize-with-browsers-not-pages) 🔥 Super fast (compared to [editly](https://github.com/mifi/editly))
- Supports all video formats/codecs that FFmpeg supports
- Headless mode (runs in the cloud)
- Output to any dimensions and aspect ratio, e.g. Instagram post (1:1), Instagram story (9:16), YouTube (16:9), or any other dimensions you like.
- Live preview for easy development
- Open source

## Installation

First install and setup ffmpeg/ffprobe.

Then we can install the Reactive Video builder globally as a command line tool:
```
npm i -g @reactive-video/builder
```

## Usage

Now create a file `MyVideo.js` with the content:

```js
import React from 'react';
import { Image, Segment, Video, useVideo } from 'reactive-video';

export default () => {
  const { currentFrame, currentTime, durationFrames, durationTime } = useVideo();

  return (
    <>
      {/* This segment lasts for 30 frames. Print out the current frame number */}
      <Segment duration={30}>
        <div
          style={{ width: '100%', height: '100%', backgroundColor: `hsl(${(currentFrame * 10) % 360}deg 78% 37%)`, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontSize: 100 }}
        >
          Current frame {currentFrame}
        </div>
      </Segment>

      {/* This segment starts from 60 frames. Shows an image with a Ken Burns zoom effect */}
      <Segment
        start={30}
        duration={30}
        render={(segment) => (
          <Image src="https://static.mifi.no/losslesscut/47320816_571610306620180_5860442193520120371_n.jpg" style={{ width: '100%', transform: `scale(${1 + (segment.currentFrame / segment.durationFrames) * 0.1})` }} />
        )}
      />

      {/* This segment starts from 60 frames. Starts 100 frames into the source video (seek to) */}
      <Segment start={60}>
        <Segment start={-100}>
          <Video src="https://static.mifi.no/Zv5RvLhCz4M-small.mp4" style={{ width: '100%' }} />
        </Segment>
      </Segment>
    </>
  );
};
```

### Shell

Then run the CLI:
```bash
reactive-video --duration-frames 90 MyVideo.js
```
Duration can also be specified in seconds. See `reactive-video --help`

### Live preview

Or to start a live preview:

```bash
reactive-video --duration-frames 90 MyVideo.js --preview
# or for HTML5 video:
reactive-video --duration-frames 90 MyVideo.js --preview-html
```

### Programmatic API

Or you can use the programmatic Node API. Create a new Node.js project, then add `@reactive-video/builder`:

```bash
mkdir awesome-reactive-video
cd awesome-reactive-video
npm init
npm i --save @reactive-video/builder
```

Create `index.js`:
```js
const Editor = require('@reactive-video/builder');

(async () => {
  const editor = Editor({
    ffmpegPath: 'ffmpeg',
    ffprobePath: 'ffprobe',
    devMode: true,
  });

  const width = 1280;
  const height = 720;
  const fps = 25;
  const durationFrames = 90;
  const reactVideo = 'MyVideo.js';
  const userData = { some: 'value' };

  // Build the video
  await editor.edit({
    reactVideo,
    width,
    height,
    durationFrames,
    userData,

    output: 'my-video.mov',
    concurrency: 3,
    // headless: false,
    // extraPuppeteerArgs: ['--no-sandbox', '--disable-setuid-sandbox']

    // Optionally set rawOutput to false if you want to encode output to h264 (if not it will create MJPEG)
    // rawOutput: false,
  });

  // Or start a live preview:
  await editor.preview({
    reactVideo,
    width,
    height,
    fps,
    durationFrames,
    userData,
  });
})().catch(console.error);
```

## Node API

Reactive Video has two parts:
- `@reactive-video/builder`: CLI and Node.js video builder API
- `reactive-video`: Code that runs in the React world. This package can also be installed in a separate frontend where you want to reuse Reactive Video code to render a video.

Data can be passed from Node.js to React via `userData`, which will become available in the `useVideo` hook.

### `Editor.edit` / `Editor.preview`

```js
const Editor = require('@reactive-video/builder');

const { edit, preview } = Editor({ ffmpegPath, ffprobePath });
```

See [editor.js edit and preview](packages/builder/index.js) for options.

### `Editor.readVideoMetadata`

Useful to read an input video's parameters and use it for your video, for instance if you want to render something on top of an existing video. Returns `durationTime`. If `countFrames` is `true`, returns also `durationFrames`, which is more accurate, but slower. Example:

```js
const { pathToFileURL } = require('url');
const inputVideoPath = '/path/to/input-video.mp4';

const { edit, readVideoMetadata } = Editor();
const { width, height, fps, durationTime, durationFrames } = await readVideoMetadata({ path: inputVideoPath, countFrames: true });

await edit({
  reactVideo: 'MyVideo.js',
  width,
  height,
  fps,
  durationFrames,
  userData: { videoUri: pathToFileURL(inputVideoPath) },
  // videoUri becomes file:///path/to/input-video.mp4
});
```

Then in `MyVideo.js`:
```js
export default () => {
  const { userData: { videoUri } } = useVideo();

  return <Video src={videoUri} />;
}
```

## React API

```js
impprt {
  Video,
  IFrame,
  Image,
  Segment,
  useVideo,
  useAsyncRenderer,
} from 'reactive-video'
```

### `<Video>` component

Renders video frames synced to time

- `src` - See **src** below.
- `htmlSrc` - Override `Video` component `src` by specifying a different URL to be used when rendering the video code in e.g. a separate React frontend.
- `scaleToWidth` / `scaleToHeight` - Will cause ffmpeg to scale down the video before sending it to the page. Can give a great speed increase if scaling down a large source video.

For final rendering and preview, Reactive Video uses ffmpeg to stream individual frams to an `<img>` tag. Efficiently reuses the ffmpeg instance for sequential rendering. Supports virtually all formats that ffmpeg can seek in, even over HTTP (e.g. AWS S3)

Can also use HTML5 `<video>` for preview. Much faster seeking, but only supports certain codecs. Enabled with the `--preview-html` CLI flag.

### `<Image>`

Works the same as HTML `<image>`. Waits for data to load.

- `src` - See **src** below.

### `<IFrame>`

Works the same as HTML `<iframe>`. Waits for data to load.

- `src` - See **src** below.

### `src` attribute

`src` must be a full, absolute `file://` or `http(s)://` URI (e.g. `file:///Users/me/video.webm` or `https://example.com/image.jpeg`). Note the three slashes for local files! **Tip:** In Node.js you can use `require('url').pathToFileURL` to convert local (also relative) paths to `file://` URIs. See example above.

### useVideo

A hook that can be used to get the current video state.

```js
const {
  // Global video properties
  fps,
  width,
  height,

  // Video (or Segment-relative) current frame:
  currentFrame,
  // Video (or Segment-relative) time:
  currentTime,
  // Video (or Segment) duration in frames:
  durationFrames,
  // Video (or Segment) duration in seconds:
  durationTime,

  // Value between 0 to 1 for the currentFrame's progress within the video (or Segment)
  // Useful for animating things inside segments.
  progress,

  // Global, never altered:
  video: {
    currentFrame,
    currentTime,
    durationFrames,
    durationTime,
  },

  // User JSON object passed from CLI (`--user-data`) or Node.js `userData` option
  userData,
} = useVideo();
```

### useAsyncRenderer

A hook used to get a `waitFor` function that can be used to delay the frame capture operation due to an asynchronous task that needs to finish before drawing.
```js
const MyVideoOrComponent = () => {
  // ...
  const { waitFor } = useAsyncRenderer();

  useEffect(() => {
    waitFor(async () => {
      setState(await api.loadSomeData());
    });
  }, [waitFor]);
  // ...
};
```

### `<Segment>`

A Segment will, for a specific timespan specified by `start` and `duration` (specified in **frames**), render one of either:
1. Its provided `children`:
  ```js
  <Segment><MyComponent /></Segment>
  ```
2. or a render prop:
  ```js
  <Segment render={(props) => <MyComponent />} />
  ```

#### Segment props
- `start` - First frame that contents should be shown from (default: `0`)
- `duration` - Number of frames that contents should be visible for (default: video `durationFrames - start`).
- `override` - Whether to override variables in the `useVideo` hook, see below (default: `true`)
- `cut` = Whether to cut off this component's children from rendering before `start` and after `duration` (default: `true`)

Segments will override the following variables in the `useVideo` hook for its `children` (unless `override` = `false`):
- `currentFrame`
- `currentTime`
- `durationFrames`
- `durationTime`

Theses variables will instead be *relative to the start/duration* of the `Segment`. If the `render` prop is used, the render function's provided `props` argument will also contain the same relative variables.

## Importing resources

Resources are fetched from the local filesystem automatically during `edit` and `preview` with `file://` or remotely using `http(s)://`. You can also import resources from your React components using ES6 `import`. This can be used to import css, images, and even videos, but it is recommended to not import large videos like this, as they will be copied to the `dist` directory during the compile.

```js
// MyVideo.js
import React from 'react';
import { Image } from 'reactive-video';

import image from './image.jpeg';

export default () => (
  <Image src={image} style={{ width: 100 }} />
);
```

## Reusing code in a different React app

```
npx create-react-app my-app
cd my-app
npm i --save reactive-video
```

Then you can import your Reactive Video code (e.g. `MyVideo.js` and dependencies) from a shared directory using your method of choice:
- npm/yarn workspaces (you may have to transpile the React code)
- git submodules
- ...

See example `App.js`:

```js
import { VideoContextProvider } from 'reactive-video';

import MyVideo from 'path/to/MyVideo.js';

const App = () => {
  // You need to provide these parameters:
  const durationFrames = 1234;
  const width = 800;
  const height = 600;
  const fps = 30;

  const [currentFrame, setCurrentFrame] = useState();

  const canvasStyle = {
    width,
    height,
    overflow: 'hidden',
    position: 'relative',
    border: '3px solid black',
  };

  const userData = useMemo(() => {
    some: 'data',
  }, []);

  return (
    <div style={canvasStyle}>
      <VideoContextProvider
        currentFrame={currentFrame}
        durationFrames={durationFrames}
        width={width}
        height={height}
        fps={fps}
        userData={userData}
      >
        <MyVideo />
      </VideoContextProvider>
    </div>
  );
};
```
See also [previewEntry.js](packages/builder/previewEntry.js)

## Options

`rawOutput` - `true` means saving the raw MJPEG/MPNG stream, while `false` will encode to `h264`

### Fast processing

Lower quality and/or potential skipped/duplicate frames:

```js
jpegQuality: 70, // slight speed increase
captureMethod: 'screencast', // significant speed increase, but may skip/duplicate frames
ffmpegStreamFormat: 'jpeg', // significant speed increase
puppeteerCaptureFormat: 'jpeg', // significant speed increase
rawOutput: true, // slight speed increase
```

### Slow processing

Lossless processing, very slow and yields large files:

```js
ffmpegStreamFormat: 'raw'
// or ffmpegStreamFormat 'png'
puppeteerCaptureFormat: 'png',
rawOutput: true,
```

## Examples

[See examples](examples/)

# Your video here?

Submit a PR if you want to share your Reactive Video here.

## TODO

- Improve docs
- Audio
- multiple FFmpegVideos from the same source file (videoServer.js) not supported
- FFmpegVideo fallback to previous frame if missing frame? (like HTML5Video) or make HTML5Video also work like FFmpegVideo
- puppeteer [intercept request](https://github.com/puppeteer/puppeteer/blob/v9.1.1/docs/api.md#httprequestrespondresponse) instead of starting local express server (if possible and fast to send big binary data). Will not work for preview.
- make it easier to animate (mount/unmount?) provide a react component that clamps animations? something like `<Segment start={} duration={} easing="easeIn" />`
- staggering animations (function helper or Stagger component)
- easing example code
- allow speed up/down `<segment speed={1.3} />`
- custom video component example
- preview currentFrame flooding browser history https://stackoverflow.com/questions/26793130/history-replacestate-still-adds-entries-to-the-browsing-history
- videoServer need to kill ffmpeg when finished with file? or use -t
- live video mode
- maybe not currently properly supporting different framerates. FFmpegVideo `-vf fps` in videoServer.js?

## Ideas

- subtitle rendering (programmatically create Segments)
- easy merge videos recipe/helper
- webgl
- react three js
- create demo video, YouTube video
- editly features
- Recreate editly's video in reactive-video

## Troubleshooting

- `React webpage failed to initialize`
  - Try to run with `headless false` and check puppeteer developer tools

### Normalize rendering across operating systems

Because MacOS use sub-pixel rendering, fonts will look different. To work around this, use this in your CSS:
```css
* {
  -webkit-font-smoothing: antialiased;
}
```

Puppeteer on Windows sometimes seems to use a different `line-height`, so it's recommended to fix it:
```css
body {
  line-height: 1.2;
}
```

See also https://meyerweb.com/eric/tools/css/reset/

### Useful commands for debugging videos

#### Compare hash of video content of two videos
```
ffmpeg -loglevel error -i vid1.mp4 -map 0:v -f md5 - && ffmpeg -loglevel error -i vid2.mp4 -map 0:v -f md5 -
```
#### Generate a visual diff
```
ffmpeg -i vid1.mp4 -i vid2.mp4 -filter_complex blend=all_mode=difference -c:v libx264 -crf 18 -c:a copy -y diff.mp4
```

## Donate 🙈

This project is maintained by me alone. The project will always remain free and open source, but if it's useful for you, consider supporting me. :) It will give me extra motivation to improve it. Or even better [donate to ffmpeg](https://www.ffmpeg.org/donations.html) because they are doing the world a big favor 🙏

## Release

```bash
npm run test
# Version and publish reactive-video
(cd packages/frontend && npm version minor && git add package.json && git commit -m 'Release reactive-video' && npm publish)
# If necessary (replace 2 with new major semver):
(cd packages/builder && yarn add reactive-video@2 && git add package.json && git commit -m 'Upgrade builder reactive-video')
# Version and publish builder:
(cd packages/builder && npm version minor && git add package.json && git commit -m 'Release builder' && npm publish)
# If all ok
git push
```

## See also

- [editly](https://github.com/mifi/editly) - Declarative video API I also created earlier
- [remotion](https://github.com/JonnyBurger/remotion) - Great inspiration

Made with ❤️ in [🇳🇴](https://www.youtube.com/watch?v=uQIv8Vo9_Jc)

[More apps by mifi.no](https://mifi.no/)

Follow me on [GitHub](https://github.com/mifi/), [YouTube](https://www.youtube.com/channel/UC6XlvVH63g0H54HSJubURQA), [IG](https://www.instagram.com/mifi.no/), [Twitter](https://twitter.com/mifi_no) for more awesome content!
