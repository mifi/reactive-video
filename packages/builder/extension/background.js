/* eslint-disable no-undef,@typescript-eslint/no-unused-vars */
// https://github.com/Flam3rboy/puppeteer-stream/blob/main/extension/background.js

function captureFrame() {
  // https://developer.chrome.com/docs/extensions/reference/extensionTypes/#type-ImageDetails
  chrome.tabs.captureVisibleTab(null, { format: 'jpeg' }, (image) => {
    window.onCapturedFrame(image);
  });
}
