/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let chai; let
  direct;
const noflo = require('noflo');

if (noflo.isBrowser()) {
  ({
    direct,
  } = require('noflo-runtime-base'));
} else {
  if (!chai) { chai = require('chai'); }
  direct = require('../direct');
}

describe('Graph protocol', () => {
  let runtime = null;
  let client = null;
  let client2 = null;
  let runtimeEvents = [];

  beforeEach(() => {
    runtime = new direct.Runtime({
      permissions: {
        foo: ['protocol:graph'],
      },
    });
    runtime.graph.on('updated', (msg) => runtimeEvents.push(msg));
    client = new direct.Client(runtime);
    client.connect();
    client2 = new direct.Client(runtime);
    return client2.connect();
  });
  afterEach(() => {
    client.disconnect();
    client = null;
    client2.disconnect();
    client2 = null;
    return runtime = null;
  });

  describe('sending graph:clear', () => {
    it('should fail without proper authentication', (done) => {
      const payload = {
        id: 'mygraph',
        main: true,
      };
      client.once('message', (msg) => {
        chai.expect(msg.protocol).to.equal('graph');
        chai.expect(msg.command).to.equal('error');
        return done();
      });
      return client.send('graph', 'clear', payload);
    });
    it('should respond with graph:clear', (done) => {
      const payload = {
        id: 'mygraph',
        main: true,
        secret: 'foo',
      };
      client.once('message', (msg) => {
        chai.expect(msg.protocol).to.equal('graph');
        chai.expect(msg.command).to.equal('clear');
        chai.expect(msg.payload).to.include.keys('id');
        chai.expect(msg.payload.id).to.equal(payload.id);
        return done();
      });
      return client.send('graph', 'clear', payload);
    });
    return it('should send to all clients', (done) => {
      const payload = {
        id: 'mygraph',
        main: true,
        secret: 'foo',
      };
      client2.once('message', (msg) => {
        chai.expect(msg.protocol).to.equal('graph');
        chai.expect(msg.command).to.equal('clear');
        chai.expect(msg.payload).to.include.keys('id');
        chai.expect(msg.payload.id).to.equal(payload.id);
        return done();
      });
      return client.send('graph', 'clear', payload);
    });
  });

  return describe('sending graph:addnode', () => {
    const graph = 'graphwithnodes';
    const payload = {
      id: 'node1',
      component: 'Component1',
      graph,
      metadata: {},
    };
    const authenticatedPayload = JSON.parse(JSON.stringify(payload));
    authenticatedPayload.secret = 'foo';
    const checkAddNode = function (msg, done) {
      if (msg.command !== 'addnode') { return; }
      chai.expect(msg.protocol).to.equal('graph');
      chai.expect(msg.command).to.equal('addnode');
      chai.expect(msg.payload).to.deep.equal(payload);
      return done();
    };
    after(() => runtimeEvents = []);
    it('should respond with graph:addnode', (done) => {
      client.on('message', (msg) => checkAddNode(msg, done));
      client.send('graph', 'clear', { id: graph, main: true, secret: 'foo' });
      return client.send('graph', 'addnode', authenticatedPayload);
    });
    it('should have emitted an updated event', () => {
      chai.expect(runtimeEvents.length).to.equal(1);
      const event = runtimeEvents.shift();
      return chai.expect(event.name).to.equal(graph);
    });
    return it('should send to all clients', (done) => {
      client2.on('message', (msg) => checkAddNode(msg, done));
      client.send('graph', 'clear', { id: graph, main: true, secret: 'foo' });
      return client.send('graph', 'addnode', authenticatedPayload);
    });
  });
});
