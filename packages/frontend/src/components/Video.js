import React from 'react';

import FFmpegVideo from './FFmpegVideo';
import HTML5Video from './HTML5Video';
import { useVideo } from '../contexts';

const Video = (props) => {
  const { src, htmlSrc, ...rest } = props;

  const { videoComponentType, isPuppeteer, getProxiedAssetUrl } = useVideo();

  if (videoComponentType === 'html') {
    // eslint-disable-next-line react/jsx-props-no-spreading
    if (htmlSrc) return <HTML5Video {...rest} src={htmlSrc} />;

    // If not puppeteer, proxy file:// URI through server as browser cannot handle file://
    const srcProxied = isPuppeteer ? src : getProxiedAssetUrl(src);
    // eslint-disable-next-line react/jsx-props-no-spreading
    return <HTML5Video {...rest} src={srcProxied} />;
  }

  if (videoComponentType === 'ffmpeg') {
    // eslint-disable-next-line react/jsx-props-no-spreading
    return <FFmpegVideo {...rest} src={src} />;
  }

  throw new Error(`Invalid videoComponentType ${videoComponentType}`);
};

export default Video;
