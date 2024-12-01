import { API, FFmpegParams } from './types';

export interface ReadMetadataParams {
  path: string,
  streamIndex: number,
}

export default ({ serverPort, renderId, secret }: {
  serverPort: number,
  renderId?: number,
  secret: string
}): API => {
  const baseUrl = `http://localhost:${serverPort}`;

  async function request(path: string, opts: RequestInit = {}) {
    const { headers } = opts;

    function base64() {
      const username = 'reactive-video';
      return btoa(`${username}:${secret}`);
    }

    const url = `${baseUrl}${path}`;
    const response = await fetch(url, {
      ...opts,
      headers: {
        ...headers,
        Authorization: `Basic ${base64()}`,
      },
    });

    if (!response.ok) throw new Error(`Video server responded HTTP ${url} ${response.status} ${response.statusText}`);
    return response;
  }

  const getQs = (params: FFmpegParams) => new URLSearchParams(
    Object.fromEntries(
      Object.entries({ ...params, renderId, secret })
        .filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]),
    ),
  ).toString();

  function getVideoFrameUrl(params: FFmpegParams) {
    return `${baseUrl}/api/frame?${getQs(params)}`;
  }

  async function readVideoFrame(params: FFmpegParams) {
    return request(`/api/frame?${getQs(params)}`);
  }

  async function readVideoMetadata({ path, streamIndex }: { path: string, streamIndex: number }) {
    return request('/api/read-video-metadata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, streamIndex } satisfies ReadMetadataParams) });
  }

  function getProxiedAssetUrl(uri: string) {
    if (uri.startsWith('file://')) return `${baseUrl}/root/${uri.replace(/^file:\/\//, '')}`;
    return uri;
  }

  return {
    getVideoFrameUrl,
    readVideoFrame,
    readVideoMetadata,
    getProxiedAssetUrl,
  };
};
