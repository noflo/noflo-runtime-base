describe('Network protocol', () => {
  let runtime = null;
  let client = null;
  before(() => {
    runtime = new direct.Runtime({
      permissions: {
        foo: ['protocol:graph', 'protocol:network'],
      },
      baseDir,
    });
  });
  beforeEach(() => {
    client = new direct.Client(runtime);
    client.connect();
  });
  afterEach(() => {
    if (!client) { return; }
    client.removeAllListeners('message');
    client.disconnect();
    client = null;
  });

  describe('defining a graph', () => {
    it('should succeed', () => Promise.resolve()
      .then(() => client.send('graph', 'clear', {
        id: 'bar',
        main: true,
        secret: 'foo',
      }))
      .then(() => client.send('graph', 'addnode', {
        id: 'Hello',
        component: 'core/Repeat',
        graph: 'bar',
        secret: 'foo',
      }))
      .then(() => client.send('graph', 'addnode', {
        id: 'World',
        component: 'core/Drop',
        graph: 'bar',
        secret: 'foo',
      }))
      .then(() => client.send('graph', 'addedge', {
        src: {
          node: 'Hello',
          port: 'out',
        },
        tgt: {
          node: 'World',
          port: 'in',
        },
        graph: 'bar',
        secret: 'foo',
      }))
      .then(() => client.send('graph', 'addinitial', {
        src: {
          data: 'Hello, world!',
        },
        tgt: {
          node: 'Hello',
          port: 'in',
        },
        graph: 'bar',
        secret: 'foo',
      })));
  });
  describe('starting the network', () => {
    it('should process the nodes and stop when it completes', (done) => {
      const expects = [
        'started',
        'data',
        'data',
        'stopped',
      ];
      client.on('message', (msg) => {
        if (msg.protocol !== 'network') { return; }
        chai.expect(msg.protocol).to.equal('network');
        chai.expect(msg.command).to.equal(expects.shift());
        if (!expects.length) {
          done();
        }
      });
      client.send('network', 'start', {
        graph: 'bar',
        secret: 'foo',
      })
        .catch(done);
    });
    it('should provide a "finished" status', (done) => {
      client.on('message', (msg) => {
        chai.expect(msg.protocol).to.equal('network');
        chai.expect(msg.command).to.equal('status');
        chai.expect(msg.payload.graph).to.equal('bar');
        chai.expect(msg.payload.running).to.equal(false);
        chai.expect(msg.payload.started).to.equal(false);
        done();
      });
      client.send('network', 'getstatus', {
        graph: 'bar',
        secret: 'foo',
      })
        .catch(done);
    });
    it('should be able to rename a node', () => client
      .send('graph', 'renamenode', {
        from: 'World',
        to: 'NoFlo',
        graph: 'bar',
        secret: 'foo',
      }));
    it('should not be able to add a node with a non-existing component', () => client
      .send('graph', 'addnode', {
        id: 'Nonworking',
        component: '404NotFound',
        graph: 'bar',
        secret: 'foo',
      })
      .then(
        () => Promise.reject(new Error('Unexpected success')),
        (err) => {
          chai.expect(err.message).to.include('Component 404NotFound not available');
        },
      ));
  });
});
