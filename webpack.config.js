const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: {
    test: './webpack.entry.js',
  },
  output: {
    path: path.resolve(process.cwd(), 'dist'),
    filename: '[name].js',
  },
  mode: 'production',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /noflo([\\]+|\/)lib([\\]+|\/)loader([\\]+|\/)register.js$/,
        use: [
          {
            loader: 'noflo-component-loader',
            options: {
              graph: null,
              debug: true,
              baseDir: process.cwd(),
              manifest: {
                runtimes: ['noflo'],
                discover: true,
              },
              runtimes: [
                'noflo',
                'noflo-browser',
              ],
            },
          },
        ],
      },
      {
        test: /\.coffee$/,
        use: [
          {
            loader: 'coffee-loader',
          },
        ],
      },
      {
        test: /\.fbp$/,
        use: [
          {
            loader: 'fbp-loader',
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.coffee', '.js'],
    fallback: {
      buffer: require.resolve('buffer/'),
      child_process: false,
      fs: false,
      os: false,
      constants: false,
      assert: false,
      path: require.resolve('path-browserify'),
      util: require.resolve('util'),
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: ['process'],
    }),
  ],
};
