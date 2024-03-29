import { useVideo } from '../contexts';
import ImageInternal, { ImageProps } from './ImageInternal';

const Image = (props: ImageProps) => {
  const { isPuppeteer, getProxiedAssetUrl } = useVideo();
  const { src, ...rest } = props;

  if (isPuppeteer) {
    // eslint-disable-next-line react/jsx-props-no-spreading
    return <ImageInternal {...props} _originalSrc={src} />;
  }

  const srcProxied = getProxiedAssetUrl(src);
  // eslint-disable-next-line react/jsx-props-no-spreading
  return <ImageInternal {...rest} src={srcProxied} _originalSrc={src} />;
};

export default Image;
