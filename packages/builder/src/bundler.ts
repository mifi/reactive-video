import webpack, { Compiler, Configuration, Watching } from 'webpack';
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { ReactVideoInitData } from './react/previewEntry';

export function createBundler({ entryPath, userEntryPath, outDir, mode, entryOutName = 'index.js', initData }: {
  entryPath: string,
  userEntryPath: string,
  outDir: string,
  mode: NonNullable<Configuration['mode']>,
  entryOutName?: string,
  initData?: ReactVideoInitData | undefined,
}) {
  const require = createRequire(import.meta.url);

  const config: Configuration = {
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
      extensions: ['.jsx', '.js', '.ts', '.tsx'],
      alias: {
        'reactive-video': require.resolve('reactive-video'),
        // needed for react 17 automatic runtime. Must be before `react`:
        'react/jsx-runtime': require.resolve('react/jsx-runtime'),
        'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime'),
        react: require.resolve('react'), // Use reactive-video's react package
        // 'react-dom': require.resolve('react-dom'),
        // 'react-dom/client': require.resolve('react-dom/client'),
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
                [require.resolve('@babel/preset-react'), { runtime: 'automatic' }],
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

    devtool: 'inline-source-map',

    plugins: [
      new webpack.DefinePlugin({
        'reactiveVideo.initData': JSON.stringify(initData satisfies ReactVideoInitData | undefined),
        __REACT_DEVTOOLS_GLOBAL_HOOK__: '({ isDisabled: true })', // https://stackoverflow.com/questions/42196819/disable-hide-download-the-react-devtools
      }),
    ],
  };

  return webpack(config);
}

export async function startBundler({ bundler, reactHtmlPath, reactHtmlDistName, distPath }: {
  bundler: Compiler,
  reactHtmlPath: string,
  reactHtmlDistName: string,
  distPath: string,
}) {
  return new Promise<Watching>((resolve, reject) => {
    const watcher = bundler.watch({}, (err, stats) => {
      if (err) {
        watcher.close(() => {
          // todo handle close error
          reject(err);
        });
        return;
      }
      if (stats && stats.hasErrors()) {
        watcher.close(() => {
          // todo handle close error
          reject(new Error(`Bundle failed: ${stats.toString()}`));
        });
        return;
      }

      (async () => {
        try {
          await copyFile(reactHtmlPath, join(distPath, reactHtmlDistName));
          resolve(watcher);
        } catch (err2) {
          watcher.close(() => {
            // todo handle close error
            reject(err2);
          });
        }
      })();
    });
  });
}

export async function stopBundleWatcher(bundler: Compiler, watcher: Watching) {
  await new Promise<void>((resolve, reject) => watcher.close((err) => {
    if (err) reject(err);
    else resolve();
  }));

  await new Promise<void>((resolve, reject) => bundler.close((err) => {
    if (err) reject(err);
    else resolve();
  }));
}
