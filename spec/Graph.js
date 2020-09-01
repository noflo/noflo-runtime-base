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
      baseDir,
    });
    runtime.graph.on('updated', (msg) => runtimeEvents.push(msg));
    client = new direct.Client(runtime);
    client.connect();
    client2 = new direct.Client(runtime);
    client2.connect();
  });
  afterEach(() => {
    client.disconnect();
    client = null;
    client2.disconnect();
    client2 = null;
    runtime = null;
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
        done();
      });
      client.send('graph', 'clear', payload);
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
        done();
      });
      client.send('graph', 'clear', payload);
    });
    it('should send to all clients', (done) => {
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
        done();
      });
      client.send('graph', 'clear', payload);
    });
  });

  describe('sending graph:addnode', () => {
    const graph = 'graphwithnodes';
    const payload = {
      id: 'node1',
      component: 'core/Repeat',
      graph,
      metadata: {},
    };
    const authenticatedPayload = JSON.parse(JSON.stringify(payload));
    authenticatedPayload.secret = 'foo';
    const checkAddNode = function (msg, done) {
      if (msg.command === 'error') {
        done(msg.payload);
        return;
      }
      if (msg.command !== 'addnode') {
        return;
      }
      chai.expect(msg.protocol).to.equal('graph');
      chai.expect(msg.payload).to.deep.equal(payload);
      done();
    };
    after(() => runtimeEvents = []);
    it('should respond with graph:addnode', (done) => {
      client.on('message', (msg) => checkAddNode(msg, done));
      client.send('graph', 'clear', { id: graph, main: true, secret: 'foo' });
      client.send('graph', 'addnode', authenticatedPayload);
    });
    it('should have emitted an updated event', () => {
      chai.expect(runtimeEvents.length).to.equal(1);
      const event = runtimeEvents.shift();
      chai.expect(event.name).to.equal(graph);
    });
    it('should send to all clients', (done) => {
      client2.on('message', (msg) => checkAddNode(msg, done));
      client.send('graph', 'clear', { id: graph, main: true, secret: 'foo' });
      client.send('graph', 'addnode', authenticatedPayload);
    });
  });

  describe('sending graph:addnode without an existing graph', () => {
    it('should respond with an error', (done) => {
      client.once('message', (msg) => {
        chai.expect(msg.protocol).to.equal('graph');
        chai.expect(msg.command).to.equal('error');
        done();
      });
      client.send('graph', 'addnode', {
        id: 'foo',
        component: 'Bar',
        graph: 'not-found',
        metadata: {},
        secret: 'foo',
      });
    });
  });
});
