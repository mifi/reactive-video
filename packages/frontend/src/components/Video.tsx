import FFmpegVideo from './FFmpegVideo';
import HTML5Video from './HTML5Video';
import { useVideo } from '../contexts';

type RestProps = React.DetailedHTMLProps<React.CanvasHTMLAttributes<HTMLCanvasElement>, HTMLCanvasElement>
& React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>
& React.DetailedHTMLProps<React.VideoHTMLAttributes<HTMLVideoElement>, HTMLVideoElement>;

const Video = ({ src, htmlSrc, ...rest }: RestProps & { htmlSrc?: string }) => {
  const { videoComponentType, isPuppeteer, getProxiedAssetUrl } = useVideo();

  if (videoComponentType === 'html') {
    // eslint-disable-next-line react/jsx-props-no-spreading
    if (htmlSrc) return <HTML5Video {...rest} src={htmlSrc} />;

    if (src == null) throw new Error('You must provide either htmlSrc or src');

    // If not puppeteer, proxy file:// URI through server as browser cannot handle file://
    const srcProxied = isPuppeteer ? src : getProxiedAssetUrl(src);
    // eslint-disable-next-line react/jsx-props-no-spreading
    return <HTML5Video {...rest} src={srcProxied} />;
  }

  if (videoComponentType === 'ffmpeg') {
    if (src == null) throw new Error('You must provide src');

    // eslint-disable-next-line react/jsx-props-no-spreading
    return <FFmpegVideo {...rest} src={src} />;
  }

  throw new Error(`Invalid videoComponentType ${videoComponentType}`);
};

export default Video;
