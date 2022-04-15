const { join } = require('path');
const { pathToFileURL } = require('url');

const { testAssetsDir, edit, outputDir, getEditor } = require('./util');

(async () => {
  const editor = getEditor({ logger: console });

  const reactVideo = join(__dirname, 'video', 'ReactiveVideo.js');

  const inputVideoPath = join(testAssetsDir, 'Koh Kood.mp4');
  const userData = { videoUri: pathToFileURL(inputVideoPath), title: 'Koh Kood', description: 'Paradise in Thailand' };

  const output = join(outputDir, 'reactive-video.mov');

  const { durationTime } = await editor.readVideoMetadata({ path: inputVideoPath });

  const width = 1280;
  const height = 720;
  const fps = 30;

  /* await editor.preview({
    reactVideo,
    userData,

    durationTime,
    width,
    height,
    fps,
    videoComponentType: 'html',
  });
  return; */

  await edit(editor, {
    concurrency: 4,
    reactVideo,
    width,
    height,
    fps,
    durationTime,
    userData,
    output,
    // enableRequestLog: true,
  });
})().catch(console.error);
