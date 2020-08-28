var exported = {
  'noflo': require('noflo'),
  'noflo-runtime-base': require('./src/Base.js'),
};

if (window) {
  window.require = function (moduleName) {
    if (exported[moduleName]) {
      return exported[moduleName];
    }
    throw new Error('Module ' + moduleName + ' not available');
  };
}
