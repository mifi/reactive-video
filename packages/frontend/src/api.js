export default ({ serverPort, renderId, secret }) => {
  const baseUrl = `http://localhost:${serverPort}`;

  async function request(path, opts = {}) {
    const { headers } = opts;

    function base64() {
      const username = 'reactive-video';
      return btoa(`${username}:${secret}`);
    }

    return fetch(`${baseUrl}${path}`, {
      ...opts,
      headers: {
        ...headers,
        Authorization: `Basic ${base64()}`,
      },
    });
  }

  const getQs = (params) => new URLSearchParams(Object.fromEntries(Object.entries({ ...params, renderId, secret }).filter(([, v]) => v != null))).toString();

  function getVideoFrameUrl(params) {
    return `${baseUrl}/api/frame?${getQs({ ...params, renderId, secret })}`;
  }

  async function readVideoFrame(params) {
    return request(`/api/frame?${getQs({ ...params, renderId })}`);
  }

  async function readVideoMetadata({ path, streamIndex }) {
    return request('/api/read-video-metadata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, streamIndex }) });
  }

  function getProxiedAssetUrl(uri) {
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
