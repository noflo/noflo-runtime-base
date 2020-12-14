describe('Component protocol', () => {
  let runtime = null;
  let client = null;
  let client2 = null;
  let runtimeEvents = [];

  beforeEach(() => {
    runtime = new direct.Runtime({
      permissions: {
        foo: [
          'protocol:component',
          'component:setsource',
          'component:getsource',
        ],
      },
      baseDir,
    });
    runtime.component.on('updated', (msg) => runtimeEvents.push(msg));
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
    runtime = null;
  });

  describe('sending component:list', () => {
    it('should fail without proper authentication', () => {
      const payload = {};
      return client.send('component', 'list', payload)
        .then(
          () => Promise.reject(new Error('Unexpected success')),
          () => true,
        );
    });
    return it('should respond with list of components and a componentsready', (done) => {
      const payload = { secret: 'foo' };
      let componentsReceived = 0;
      const listener = (msg) => {
        chai.expect(msg.protocol).to.equal('component');
        chai.expect(msg.command).to.be.oneOf([
          'component',
          'componentsready',
        ]);
        if (msg.command === 'componentsready') {
          chai.expect(msg.payload).to.equal(componentsReceived);
          done();
          return;
        }
        componentsReceived += 1;
        client.once('message', listener);
      };
      client.once('message', listener);
      client.send('component', 'list', payload);
    });
  });

  describe('sending component:getsource', () => {
    it('should fail without proper authentication', () => {
      const payload = { name: 'core/Repeat' };
      return client.send('component', 'getsource', payload)
        .then(
          () => Promise.reject(new Error('Unexpected success')),
          () => true,
        );
    });
    return it('should respond with the source code of the component', () => {
      const msg = {
        name: 'core/Repeat',
        secret: 'foo',
      };
      return client.send('component', 'getsource', msg)
        .then((payload) => {
          chai.expect(payload.library).to.equal('core');
          chai.expect(payload.name).to.equal('Repeat');
          chai.expect(payload.language).to.be.oneOf([
            'javascript',
            'coffeescript',
          ]);
          chai.expect(payload.code).to.be.a('string');
        });
    });
  });

  return describe('sending component:source', () => {
    const source = `\
var noflo = require('noflo');
exports.getComponent = function () {
  return noflo.asComponent(Math.random);
};\
`;
    before(() => runtimeEvents = []);
    after(() => runtimeEvents = []);
    it('should fail without proper authentication', () => {
      const payload = {
        name: 'GetRandom',
        library: 'math',
        language: 'javascript',
        code: source,
        tests: '',
      };
      return client.send('component', 'source', payload)
        .then(
          () => Promise.reject(new Error('Unexpected success')),
          () => true,
        );
    });
    it('should not have emitted updated events', () => chai.expect(runtimeEvents).to.eql([]));
    it('should respond with a new component', (done) => {
      const payload = {
        name: 'GetRandom',
        library: 'math',
        language: 'javascript',
        code: source,
        tests: '',
        secret: 'foo',
      };
      client.once('message', (msg) => {
        chai.expect(msg.protocol).to.equal('component');
        chai.expect(msg.command).to.equal('component');
        chai.expect(msg.payload.name).to.equal('math/GetRandom');
        return done();
      });
      client.send('component', 'source', payload);
    });
    return it('should have emitted a updated event', () => {
      chai.expect(runtimeEvents.length).to.equal(1);
      const event = runtimeEvents.shift();
      chai.expect(event.name).to.equal('GetRandom');
      chai.expect(event.library).to.equal('math');
      chai.expect(event.language).to.equal('javascript');
      chai.expect(event.code).to.equal(source);
    });
  });
});
