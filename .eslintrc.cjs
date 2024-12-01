module.exports = {
  extends: ['mifi'],
  root: true,
  overrides: [
    {
      files: [
        './packages/builder/src/react/**/*.{js,mjs,cjs,mjs,jsx,ts,mts,tsx}',
        './packages/frontend/src/**/*.{js,mjs,cjs,mjs,jsx,ts,mts,tsx}',
      ],
      env: {
        node: false,
        browser: true,
      },
    },
  ],
};
