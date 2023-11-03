module.exports = {
  extends: ['airbnb', 'airbnb/hooks', 'eslint:recommended', 'plugin:import/recommended', 'plugin:import/typescript', 'plugin:@typescript-eslint/recommended', 'plugin:@typescript-eslint/stylistic', 'plugin:react/recommended', 'plugin:react/jsx-runtime', 'plugin:react-hooks/recommended', 'plugin:jsx-a11y/recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  root: true,
  parserOptions: {
    ecmaVersion: 2022,
  },
  settings: {
    'import/resolver': {
      node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
      typescript: true,
    },
  },
  rules: {
    'react/prop-types': 0,
    'max-len': 0,
    'object-curly-newline': 0,
    'react/jsx-filename-extension': 0,
    'react/jsx-one-expression-per-line': 0,
    'import/extensions': 0,
    '@typescript-eslint/no-var-requires': 0,
    'react/require-default-props': 0,
    'no-spaced-func': 0,
    'func-call-spacing': 0,
  },
  env: {
    browser: true,
    jest: true,
  },
};
