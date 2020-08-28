/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let baseDir, chai, direct;
const noflo = require('noflo');

if (noflo.isBrowser()) {
  ({
    direct
  } = require('noflo-runtime-base'));
  baseDir = 'noflo-runtime-base';
} else {
  if (!chai) { chai = require('chai'); }
  direct = require('../direct');
  const path = require('path');
  baseDir = path.resolve(__dirname, '../');
}

describe('Network protocol', function() {
  let runtime = null;
  let client = null;
  before(() => runtime = new direct.Runtime({
    permissions: {
      foo: ['protocol:graph', 'protocol:network']
    },
    baseDir
  }));
  beforeEach(function() {
    client = new direct.Client(runtime);
    return client.connect();
  });
  afterEach(function() {
    if (!client) { return; }
    client.removeAllListeners('message');
    client.disconnect();
    return client = null;
  });

  describe('defining a graph', () => it('should succeed', function(done) {
    client.on('error', err => done(err));
    client.on('message', function(msg) {
      if (msg.command === 'error') {
        return done(msg.payload);
      }
      if (msg.command !== 'addinitial') { return; }
      chai.expect(msg.payload.src.data).to.equal('Hello, world!');
      return done();
    });
    client.send('graph', 'clear', {
      id: 'bar',
      main: true,
      secret: 'foo'
    }
    );
    client.send('graph', 'addnode', {
      id: 'Hello',
      component: 'core/Repeat',
      graph: 'bar',
      secret: 'foo'
    }
    );
    client.send('graph', 'addnode', {
      id: 'World',
      component: 'core/Drop',
      graph: 'bar',
      secret: 'foo'
    }
    );
    client.send('graph', 'addedge', {
      src: {
        node: 'Hello',
        port: 'out'
      },
      tgt: {
        node: 'World',
        port: 'in'
      },
      graph: 'bar',
      secret: 'foo'
    }
    );
    return client.send('graph', 'addinitial', {
      src: {
        data: 'Hello, world!'
      },
      tgt: {
        node: 'Hello',
        port: 'in'
      },
      graph: 'bar',
      secret: 'foo'
    }
    );
  }));
  return describe('starting the network', function() {
    it('should process the nodes and stop when it completes', function(done) {
      const expects = [
        'started',
        'data',
        'data',
        'stopped'
      ];
      client.on('error', err => done(err));
      client.on('message', function(msg) {
        if (msg.command === 'error') {
          return done(msg.payload);
        }
        if (msg.protocol !== 'network') { return; }
        chai.expect(msg.protocol).to.equal('network');
        chai.expect(msg.command).to.equal(expects.shift());
        if (!expects.length) { return done(); }
      });
      return client.send('network', 'start', {
        graph: 'bar',
        secret: 'foo'
      }
      );
    });
    return it('should provide a "finished" status', function(done) {
      client.on('error', err => done(err));
      client.on('message', function(msg) {
        chai.expect(msg.protocol).to.equal('network');
        chai.expect(msg.command).to.equal('status');
        chai.expect(msg.payload.graph).to.equal('bar');
        chai.expect(msg.payload.running).to.equal(false);
        chai.expect(msg.payload.started).to.equal(false);
        return done();
      });
      return client.send('network', 'getstatus', {
        graph: 'bar',
        secret: 'foo'
      }
      );
    });
  });
});
