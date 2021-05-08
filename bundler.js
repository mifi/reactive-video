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
        'reactive-video': require.resolve('.'),
      },
    },

    module: {
      rules: [
        {
          test: /\.(jsx|js)$/,
          // exclude: /node_modules/,
          use: [{
            loader: require.resolve('babel-loader'),
            options: {
              presets: [
                ['@babel/preset-env', {
                  targets: {
                    chrome: 90,
                  },
                }],
                '@babel/preset-react',
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
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
  };

  return webpack(config);
}

module.exports = { createBundler };
