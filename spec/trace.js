/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let baseDir, direct, Tracer;
const noflo = require('noflo');

if (noflo.isBrowser()) {
  ({
    direct
  } = require('noflo-runtime-base'));
  ({ Tracer } = require('noflo-runtime-base').trace);
  baseDir = '/noflo-runtime-base';
} else {
  if (!chai) { var chai = require('chai'); }
  direct = require('../direct');
  ({ Tracer } = require('../trace'));
  const path = require('path');
  baseDir = path.resolve(__dirname, '../');
}

describe('Tracer', function() {
  let tracer = null;

  describe.skip('attached to Noflo.Component', function() {
    let component = null;
    const trace = null;

    before(function(done) {
      this.timeout(20*1000);
      console.log('before', Tracer);
      tracer = new Tracer;
      const loader = new noflo.ComponentLoader(baseDir);
      return loader.load('noflo-runtime-base/TestRepeats', function(err, instance) {
        if (err) { return done(err); }
        component = instance;
        return component.once('ready', function() {
          tracer.attach(instance.network);
          return setTimeout(done, 1);
        });
      });
    });

    after(function(done) {
      this.timeout(10*1000);
      return done();
    });

    it('should collect data coming through', function(done) {
      component.once('stop', function() {
        tracer.dumpString(function(err, f) {
          if (err) { return done(err); }
        });
        console.log('Wrote flowtrace to', f);
        return done();
      });

      return component.start();
    });

    it('trace should contain graph');

    it('trace should contain subgraphs');

    it('trace should have data events');

    it('trace should have groups events');

    it('trace should have data send from exported outport');

    return it('trace should have data send to exported inport');
  });

  return describe('tracing unserializable events', () => it('should drop only those events'));
});


describe('FBP protocol tracing', () => // TODO: https://github.com/noflo/noflo-runtime-base/issues/36
describe(
  'runtime with trace=true',
  () => describe('triggering trace', () => it('should return trace'))
));
