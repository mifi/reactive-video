const webpack = require('webpack');

function createBundler({ entryPath, userEntryPath, outDir, mode, entryOutName = 'index.js' }) {
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
            || (/node_modules\/reactive-video/.test(modulePath) && !/node_modules\/reactive-video\/node_modules/.test(modulePath))
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
          test: /\.png|jpg|jpeg|svg|bmp|webp|gif|webm|mp4|woff|woff2/,
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
  };

  return webpack(config);
}

module.exports = { createBundler };
