describe('Base interface', () => {
  describe('without a graph', () => {
    it('should become ready without network', (done) => {
      const rt = new direct.Runtime({
        baseDir,
      });
      rt.on('ready', (net) => {
        chai.expect(net).to.equal(null);
        done();
      });
    });
  });
  describe('with a working default graph', () => {
    it('should register and run a network', (done) => {
      const graphData = {
        processes: {
          Node1: {
            component: 'core/RepeatAsync',
          },
        },
        connections: [
          {
            data: 'My message to print',
            tgt: {
              process: 'Node1',
              port: 'in',
            },
          },
        ],
      };
      let readyReceived = false;
      let startReceived = false;
      noflo.graph.loadJSON(graphData, (err, graph) => {
        if (err) {
          done(err);
          return;
        }
        const rt = new direct.Runtime({
          defaultGraph: graph,
          baseDir,
        });
        rt.on('ready', (net) => {
          chai.expect(net).to.be.an('object');
          chai.expect(net.start).to.be.a('function');
          chai.expect(net.graph).to.equal(graph);
          readyReceived = true;
        });
        rt.network.on('addnetwork', (network) => {
          network.on('start', () => {
            startReceived = true;
          });
          network.on('end', () => {
            chai.expect(readyReceived, 'should have received ready').to.equal(true);
            chai.expect(startReceived, 'should have received start').to.equal(true);
            done();
          });
        });
      });
    });
  });
  describe('with a graph containing a faulty IIP', () => {
    it('should emit an error', (done) => {
      const graphData = {
        processes: {
          Node1: {
            component: 'core/Repeat',
          },
        },
        connections: [
          {
            data: 'My message to print',
            tgt: {
              process: 'Node1',
              port: 'missing',
            },
          },
        ],
      };
      noflo.graph.loadJSON(graphData, (err, graph) => {
        if (err) {
          done(err);
          return;
        }
        const rt = new direct.Runtime({
          defaultGraph: graph,
          baseDir,
        });
        rt.on('ready', () => {
          done(new Error('Received unexpected network'));
        });
        rt.on('error', (err) => {
          chai.expect(err).to.be.an('error');
          chai.expect(err.message).to.include('No inport \'missing\'');
          done();
        });
      });
    });
  });
});
