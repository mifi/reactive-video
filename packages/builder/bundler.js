const webpack = require('webpack');
const { copyFile } = require('fs').promises;
const { join } = require('path');

function createBundler({ entryPath, userEntryPath, outDir, mode, entryOutName = 'index.js', initData }) {
  const config = {
    mode,
    entry: [
      entryPath,
      userEntryPath,
    ],
    output: {
      path: outDir,
      filename: entryOutName,
    },
    resolve: {
      extensions: ['.jsx', '.js'],
      alias: {
        'reactive-video': require.resolve('reactive-video'),
        react: require.resolve('react'), // Use reactive-video's react package
        'react-dom': require.resolve('react-dom'),
        'reactive-video-root-component': userEntryPath,
      },
    },

    module: {
      rules: [
        {
          test: /\.(jsx|js)$/,

          exclude: (modulePath) => !(
            !/node_modules/.test(modulePath)
            || (/node_modules\/@reactive-video\/builder/.test(modulePath) && !/node_modules\/@reactive-video\/builder\/node_modules/.test(modulePath))
          ),

          use: [{
            loader: require.resolve('babel-loader'),
            options: {
              presets: [
                [require.resolve('@babel/preset-env'), {
                  targets: {
                    chrome: 90,
                  },
                }],
                require.resolve('@babel/preset-react'),
              ],
            },
          }],
        },
        {
          test: /\.png|jpg|jpeg|svg|bmp|webp|gif|webm|mp4|woff|woff2|ttf|otf/,
          type: 'asset/resource',
        },
        {
          test: /\.css$/i,
          use: [require.resolve('style-loader'), require.resolve('css-loader')],
        },
      ],
    },

    optimization: {
      minimize: false,
    },

    devtool: 'eval',

    plugins: [
      new webpack.DefinePlugin({
        'reactiveVideo.initData': JSON.stringify(initData),
        __REACT_DEVTOOLS_GLOBAL_HOOK__: '({ isDisabled: true })', // https://stackoverflow.com/questions/42196819/disable-hide-download-the-react-devtools
      }),
    ],
  };

  return webpack(config);
}

async function startBundler({ bundler, reactHtmlPath, reactHtmlDistName, distPath }) {
  return new Promise((resolve, reject) => {
    const watcher = bundler.watch({}, (err, stats) => {
      if (err) {
        reject(err);
        watcher.close();
        return;
      }
      if (stats.hasErrors()) {
        watcher.close();
        reject(new Error(`Bundle failed: ${stats.toString()}`));
        return;
      }

      (async () => {
        try {
          await copyFile(reactHtmlPath, join(distPath, reactHtmlDistName));
          resolve(watcher);
        } catch (err2) {
          watcher.close();
          reject(err2);
        }
      })();
    });
  });
}

async function stopBundleWatcher(bundler, watcher) {
  await new Promise((resolve, reject) => watcher.close((err) => {
    if (err) reject(err);
    else resolve();
  }));

  await new Promise((resolve, reject) => bundler.close((err) => {
    if (err) reject(err);
    else resolve();
  }));
}

module.exports = { createBundler, startBundler, stopBundleWatcher };
