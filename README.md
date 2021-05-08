<div align="center">
	<br>
	<br>
  <p><img src="logo.png" alt="Reactive Video" /></a></p>
    <a href="https://github.com/mifi/lossless-cut#download"><img src="https://img.shields.io/npm/v/reactive-video" /></a> <a href="https://paypal.me/mifino/usd"><img src="https://img.shields.io/badge/Donate-PayPal-green.svg" /></a>
	<br>
	<br>
	<br>
</div>

Reactive Videos are created using HTML and React components. This allows you the almost leverage the almost limitless possibilities of the web browser to render dynamic content into a video file.

## How does it work?

Reactive Video fires up one or more Puppeteer tabs to render the React component hierarchy and rapidly capture screenshots for each frame when they are done rendering.

NOTE: It starts a HTTP server on `localhost` serving files in the current directory.

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

Then run in a shell:
```bash
react-video --duration-frames 90 MyVideo.js
```

Or to start a live preview:

```bash
react-video --duration-frames 90 MyVideo.js --preview
```

## Documentation

Reactive Video provides certain components that must be used in order to correctly.

### FFmpegVideo
Backed by ffmpeg, streamed to `canvas`
*NOTE:* `src` must be supplied as a local path e.g. `./video.mp4`. This is a current limitation.

### HTML5Video
Works the same as HTML `<video>`. Only supports certain codecs.
*NOTE:* `src` must be supplied as a full, absolute `file://` path (e.g. `file:///path/to/video`). This is a current limitation.

### IFrame
Works the same as HTML `<iframe>`
*NOTE:* `src` must be supplied as a full, absolute `file://` path (e.g. `file:///path/to/video`). This is a current limitation.

### Image
Works the same as HTML `<image>`
*NOTE:* `src` must be supplied as a full, absolute `file://` path (e.g. `file:///path/to/video`). This is a current limitation.

### setRoot
You must call this with your root component.

### getUserData
Call this function to get user JSON data passed from CLI or Node.js

### useVideo
A hook that can be used to get the current video state.

### useAsyncRenderer
A hook to get a `waitFor` function that must be used when you want the frame capture operation to be delayed due to an asynchronous task that needs to finish first.
```js
const { waitFor } = useAsyncRenderer();
waitFor(async () => {
	setState(await api.loadSomeData());
});
```

## Examples

![See examples](examples/)

## Donate 🙈

This project is maintained by me alone. The project will always remain free and open source, but if it's useful for you, consider supporting me. :) It will give me extra motivation to improve it. Or even better [donate to ffmpeg](https://www.ffmpeg.org/donations.html) because they are doing the world a big favor 🙏

# Your video here?

Submit a PR if you want to share your Reactive Video here.

## TODO

- Audio
- ci tests
- Improve logging
- multiple FFmpegVideos from the same source file (videoServer.js) not supported
- FFmpegVideo/HTML5Video fallback to previous frame if missing?
- HTML5Video calculate file:// paths relative to cwd, or proxy local files
- puppeteer intercept request instead of starting local express server (if possible/fast to send big binary data)
- Improve preview (don't use query string) webpack inject?
- preview.html wait for render complete, to avoid flooding with ffmpeg processes
- Retry screencast (sometimes (very rare) `Page.screencastFrame` stops getting called)

## Ideas
- subtitle rendering (programmatically create Segments)
- merge videos
- webgl
- react three js
- editly
- Recreate editly video

## See also

- [editly](https://github.com/mifi/editly) - Declarative video API I also created earlier
- [remotion](https://github.com/JonnyBurger/remotion) - Great inspiration

Made with ❤️ in [🇳🇴](https://www.youtube.com/watch?v=uQIv8Vo9_Jc)

[More apps by mifi.no](https://mifi.no/)

Follow me on [GitHub](https://github.com/mifi/), [YouTube](https://www.youtube.com/channel/UC6XlvVH63g0H54HSJubURQA), [IG](https://www.instagram.com/mifi.no/), [Twitter](https://twitter.com/mifi_no) for more awesome content!