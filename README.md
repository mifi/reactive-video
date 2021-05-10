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

Reactive Video fires up one or more Puppeteer/Chromium tabs to render the React component hierarchy and rapidly capture screenshots for each frame when they are done rendering.

NOTE: It starts a HTTP server on `localhost` serving files in the current directory for the Puppeteer client.

## Features

- Edit videos with code! 🤓
- Full power of the web
- Parallel rendering 🔥 Super fast (compared to [editly](https://github.com/mifi/editly))
- Supports all video formats/codecs that FFmpeg supports
- Headless mode (runs in the cloud)
- Output to any dimensions and aspect ratio, e.g. Instagram post (1:1), Instagram story (9:16), YouTube (16:9), or any other dimensions you like.
- Live preview for easy development
- Open source

## Installation

First install and setup ffmpeg/ffprobe.

```
npm i -g reactive-video
```

## Usage

Create a file `MyVideo.js` with the content:

```js
import React from 'react';
import { Image, Segment, FFmpegVideo, useVideo, setRoot } from 'reactive-video';

const MyVideo = () => {
  const { currentFrame, currentTime, durationFrames, durationTime } = useVideo();

  return (
    <>
      {/* This segment lasts 30 frames. Print out the current frame number */}
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

      {/* This segment starts from 60 frames. Cut from 100 frames in the source video */}
      <Segment start={60}>
        <Segment start={-100}>
          <FFmpegVideo src="https://static.mifi.no/Zv5RvLhCz4M-small.mp4" style={{ width: '100%' }} />
        </Segment>
      </Segment>
    </>
  );
};

// Set this as the root component, so we know what to render
setRoot(MyVideo);
```

### Shell

Then run in a shell:
```bash
reactive-video --duration-frames 90 MyVideo.js
```

### Live preview

Or to start a live preview:

```bash
reactive-video --duration-frames 90 MyVideo.js --preview
```

### Programmatic API

Or you can use the programmatic API. Create a new Node.js project, then add reactive-video:
```bash
mkdir awesome-project
cd awesome-project
npm init
npm i --save reactive-video
```

Create `index.js`:
```js
const Editor = require('reactive-video/editor');

(async () => {
  const editor = Editor({
    devMode: true,
  });

  const width = 1280;
  const height = 720;
  const fps = 25;
  const durationFrames = 90;
  const reactVideo = 'MyVideo.js'
  const userData = { some: 'value' };

  await editor.edit({
    reactVideo,
    width,
    height,
    durationFrames,
    userData,

    output: 'my-video.mp4',
    concurrency: 3,
    // headless: false,

  });

  // Or start a live preview
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

Reactive Video is split between code that runs in Node.js and code that runs in the React world. Coordination can happen through `userData`.

The Node API is being used directly by the CLI.

### Editor.edit / Editor.preview

```js
const Editor = require('reactive-video/editor');

const { edit, preview } = Editor({ ffmpegPath, ffprobePath });
```

See editor.js [edit](https://github.com/mifi/reactive-video/blob/09c8dba1726065f927bd8811111fc4354e6637c8/editor.js#L91) and [preview](https://github.com/mifi/reactive-video/blob/09c8dba1726065f927bd8811111fc4354e6637c8/editor.js#L329) for options.

## React API

### FFmpegVideo
Video backed by ffmpeg, streamed to `canvas`. Efficiently reuses the ffmpeg instance for serial rendering. Supports virtually all formats.

*NOTE:* `src` must be supplied as a local path **without** `file://`. (e.g. `./video.mp4`). This is a current limitation that will be improved.

### HTML5Video
Works the same as HTML `<video>`. Only supports certain codecs due to Chromium limitations (e.g. does not support `h264`.)

*NOTE:* `src` must be supplied as a full, absolute path (e.g. `file:///Users/me/video.webm` or `https://example.com/video.webm`). This is a current limitation that will be improved.

### IFrame
Works the same as HTML `<iframe>`

*NOTE:* `src` must be supplied as a full, absolute path (e.g. `file:///Users/me/index.html` or `https://example.com/index.html`). This is a current limitation that will be improved.

### Image
Works the same as HTML `<image>`

*NOTE:* `src` must be supplied as a full, absolute path (e.g. `file:///Users/me/photo.jpg` or `https://example.com/photo.jpg`). This is a current limitation that will be improved.

### setRoot
You must call this *once* with your root component.

### getUserData
Call this function to get user JSON data passed from CLI (`--user-data`) or Node.js `userData` option.

### useVideo
A hook that can be used to get the current video state.

```js
const {
  // Video (or Segment relative) frame count:
  currentFrame,
  // Video (or Segment relative) time:
  currentTime,
  // Video (or Segment) duration in frames:
  durationFrames,
  // Video (or Segment) duration in seconds:
  durationTime,

  // Global, never altered:
  video: {
    currentFrame,
    currentTime,
    durationFrames,
    durationTime,
  },

  // Global video properties
  fps,
  width,
  height,
} = useVideo();
```

### useAsyncRenderer

A hook used to get a `waitFor` function that must be used when you want the frame capture operation to be delayed due to an asynchronous task that needs to finish first.
```js
const { waitFor } = useAsyncRenderer();
waitFor(async () => {
  setState(await api.loadSomeData());
});
```

### Segment

A Segment will, for a specific timespan specified by frame number `start` and `duration`, render either:
1. Its provided `children`:
  ```js
  <Segment><MyComponents /></Segment>
  ```
2. or a render prop:
  ```js
  <Segment render={(props) => <MyComponents />} />
  ```

#### Segment props
- `start` - First frame that contents should be shown from (default 0)
- `duration` - Number of frames that contents should be visible for (default video `durationFrames`).

Segments will override the following variables in the `useVideo` hook for its `children`:
- `currentFrame`
- `currentTime`
- `durationFrames`
- `durationTime`

Theses variables will instead be relative to the start/duration of the Segment.

If the `render` prop is used, the render function's provided `props` argument will also contain the same variables.

## Examples

[See examples](examples/)

# Your video here?

Submit a PR if you want to share your Reactive Video here.

## TODO

- Preview doesn't support local paths (unless imported)
- Improve docs
- Audio
- ci tests
- Improve logging
- multiple FFmpegVideos from the same source file (videoServer.js) not supported
- FFmpegVideo/HTML5Video fallback to previous frame if missing?
- HTML5Video calculate file:// paths relative to cwd, or proxy local files
- puppeteer intercept request instead of starting local express server (if possible/fast to send big binary data)
- Improve preview (don't use query string) webpack inject?
- preview.html wait for render complete, to avoid flooding with ffmpeg processes
- Retry screencast (sometimes, very rarely, `Page.screencastFrame` stops getting called)
- Do we need webpack mode `production`? We don't need all the uglifying etc. `development` is much faster
- Source maps would be great in production too
- make it easiser to animate (mount/unmount?) provide a react component that clamps animations? something like `<Segment start={} duration={} render=((animation) => 0..1) easing="easeIn" />`


## Ideas

- subtitle rendering (programmatically create Segments)
- easy merge videos recipe/helper
- webgl
- react three js
- create demo video, YouTube video
- editly features
- Recreate editly's video in reactive-video

## Donate 🙈

This project is maintained by me alone. The project will always remain free and open source, but if it's useful for you, consider supporting me. :) It will give me extra motivation to improve it. Or even better [donate to ffmpeg](https://www.ffmpeg.org/donations.html) because they are doing the world a big favor 🙏

## See also

- [editly](https://github.com/mifi/editly) - Declarative video API I also created earlier
- [remotion](https://github.com/JonnyBurger/remotion) - Great inspiration

Made with ❤️ in [🇳🇴](https://www.youtube.com/watch?v=uQIv8Vo9_Jc)

[More apps by mifi.no](https://mifi.no/)

Follow me on [GitHub](https://github.com/mifi/), [YouTube](https://www.youtube.com/channel/UC6XlvVH63g0H54HSJubURQA), [IG](https://www.instagram.com/mifi.no/), [Twitter](https://twitter.com/mifi_no) for more awesome content!