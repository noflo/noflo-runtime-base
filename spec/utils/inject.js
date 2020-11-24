/* eslint-disable */
if (typeof global !== 'undefined') {
  // Node.js injections for Mocha tests
  global.chai = require('chai');
  global.path = require('path');
  global.noflo = require('noflo');
  global.direct = require('../../src/direct');
  global.baseDir = process.cwd();
} else {
  // Browser injections for Mocha tests
  window.noflo = require('noflo');
  window.direct = require('noflo-runtime-base').direct;
  window.baseDir = 'browser';
}
