describe('Runtime protocol', () => {
  let runtime = null;
  let client = null;

  describe('sending runtime:getruntime', () => {
    beforeEach(() => {
      runtime = new direct.Runtime();
      client = new direct.Client(runtime);
      client.connect();
    });
    afterEach(() => {
      client.disconnect();
      client = null;
      runtime = null;
    });
    it('should respond with runtime:runtime for unauthorized user', () => client
      .send('runtime', 'getruntime', null)
      .then((payload) => {
        chai.expect(payload.type).to.have.string('noflo');
        chai.expect(payload.capabilities).to.eql([]);
        chai.expect(payload.allCapabilities).to.include('protocol:graph');
      }));
    it('should respond with runtime:runtime for authorized user', () => {
      client.disconnect();
      runtime = new direct.Runtime({
        permissions: {
          'super-secret': ['protocol:graph', 'protocol:component', 'unknown:capability'],
          'second-secret': ['protocol:graph', 'protocol:runtime'],
        },
      });
      client = new direct.Client(runtime);
      client.connect();
      return client.send('runtime', 'getruntime', {
        secret: 'super-secret',
      })
        .then((payload) => {
          chai.expect(payload.type).to.have.string('noflo');
          chai.expect(payload.capabilities).to.eql(['protocol:graph', 'protocol:component']);
          chai.expect(payload.allCapabilities).to.include('protocol:graph');
        });
    });
  });
  describe('with a graph containing exported ports', () => {
    let ports = null;
    before(() => {
      runtime = new direct.Runtime({
        permissions: {
          'second-secret': ['protocol:graph', 'protocol:runtime', 'protocol:network'],
        },
        baseDir,
      });
      runtime.runtime.on('ports', (emittedPorts) => {
        ports = emittedPorts;
      });
      client = new direct.Client(runtime);
      client.connect();
    });
    after(() => {
      client.disconnect();
      client = null;
      runtime = null;
      runtime = new direct.Runtime();
      ports = null;
    });
    it('should be possible to upload graph', () => Promise.resolve()
      .then(() => client.send('graph', 'clear', {
        id: 'bar',
        main: true,
        secret: 'second-secret',
      }))
      .then(() => client.send('graph', 'addnode', {
        id: 'Hello',
        component: 'core/Repeat',
        graph: 'bar',
        secret: 'second-secret',
      }))
      .then(() => client.send('graph', 'addnode', {
        id: 'World',
        component: 'core/Repeat',
        graph: 'bar',
        secret: 'second-secret',
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
        secret: 'second-secret',
      }))
      .then(() => client.send('graph', 'addinport', {
        public: 'in',
        node: 'Hello',
        port: 'in',
        graph: 'bar',
        secret: 'second-secret',
      }))
      .then(() => client.send('graph', 'addoutport', {
        public: 'out',
        node: 'World',
        port: 'out',
        graph: 'bar',
        secret: 'second-secret',
      })));
    it('should be possible to start the network', () => client
      .send('network', 'start', {
        graph: 'bar',
        secret: 'second-secret',
      }));
    it('packets sent to IN should be received at OUT', (done) => {
      const payload = { hello: 'World' };
      client.on('error', (err) => done(err));
      const messageListener = function (msg) {
        if (msg.protocol !== 'runtime') { return; }
        if (msg.command !== 'packet') { return; }
        if (msg.payload.port !== 'out') { return; }
        if (msg.payload.event !== 'data') { return; }
        chai.expect(msg.payload.payload).to.eql(payload);
        client.removeListener('message', messageListener);
        done();
      };
      client.on('message', messageListener);
      client.send('runtime', 'packet', {
        graph: 'bar',
        port: 'in',
        event: 'data',
        payload,
        secret: 'second-secret',
      })
        .catch(done);
    });
    it('should have emitted ports via JS API', () => {
      chai.expect(ports.inPorts.length).to.equal(1);
      chai.expect(ports.outPorts.length).to.equal(1);
    });
    it('packets sent via JS API to IN should be received at OUT', (done) => {
      const payload = { hello: 'JavaScript' };
      runtime.runtime.on('packet', (msg) => {
        if (msg.event !== 'data') { return; }
        chai.expect(msg.payload).to.eql(payload);
        done();
      });
      runtime.runtime.sendPacket({
        graph: 'bar',
        port: 'in',
        event: 'data',
        payload,
        secret: 'second-secret',
      })
        .catch(done);
    });
  });
});
