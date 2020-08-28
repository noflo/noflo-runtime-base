const path = require('path');

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
  },
  node: {
    child_process: 'empty',
    fs: 'empty',
  },
};
