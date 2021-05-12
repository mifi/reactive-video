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

  async function readVideoFrame(params) {
    return request('/api/read-frame', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...params, renderId }) });
  }

  async function readVideoMetadata({ path, streamIndex }) {
    return request('/api/read-video-metadata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, streamIndex }) });
  }

  function getProxiedHtmlVideoUrl(uri) {
    if (uri.startsWith('file://')) return `${baseUrl}/root/${uri.replace(/^file:\/\//, '')}`;
    return uri;
  }

  return {
    readVideoFrame,
    readVideoMetadata,
    getProxiedHtmlVideoUrl,
  };
};
