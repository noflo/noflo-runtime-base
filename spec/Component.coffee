noflo = require 'noflo'

if noflo.isBrowser()
  direct = require('noflo-runtime-base').direct
  baseDir = ''
else
  chai = require 'chai' unless chai
  direct = require '../direct'
  path = require 'path'
  baseDir = path.resolve __dirname, '../'

describe 'Component protocol', ->
  runtime = null
  client = null
  client2 = null
  runtimeEvents = []

  beforeEach ->
    runtime = new direct.Runtime
      permissions:
        foo: [
          'protocol:component'
          'component:setsource'
          'component:getsource'
        ]
      baseDir: baseDir
    runtime.component.on 'updated', (msg) ->
      runtimeEvents.push msg
    client = new direct.Client runtime
    client.connect()
    client2 = new direct.Client runtime
    client2.connect()
  afterEach ->
    client.disconnect()
    client = null
    client2.disconnect()
    client2 = null
    runtime = null

  describe 'sending component:list', ->
    it 'should fail without proper authentication', (done) ->
      payload = {}
      client.once 'message', (msg) ->
        chai.expect(msg.protocol).to.equal 'component'
        chai.expect(msg.command).to.equal 'error'
        done()
      client.send 'component', 'list', payload
    it 'should respond with list of components and a componentsready', (done) ->
      payload =
        secret: 'foo'
      componentsReceived = 0
      listener = (msg) ->
        chai.expect(msg.protocol).to.equal 'component'
        chai.expect(msg.command).to.be.oneOf [
          'component'
          'componentsready'
        ]
        if msg.command is 'componentsready'
          chai.expect(msg.payload).to.equal componentsReceived
          done()
          return
        componentsReceived++
        client.once 'message', listener
      client.once 'message', listener
      client.send 'component', 'list', payload

  describe 'sending component:getsource', ->
    it 'should fail without proper authentication', (done) ->
      payload =
        name: 'core/Repeat'
      client.once 'message', (msg) ->
        chai.expect(msg.protocol).to.equal 'component'
        chai.expect(msg.command).to.equal 'error'
        done()
      client.send 'component', 'getsource', payload
    it 'should respond with the source code of the component', (done) ->
      payload =
        name: 'core/Repeat'
        secret: 'foo'
      client.once 'message', (msg) ->
        chai.expect(msg.protocol).to.equal 'component'
        chai.expect(msg.command).to.equal 'source'
        chai.expect(msg.payload.library).to.equal 'core'
        chai.expect(msg.payload.name).to.equal 'Repeat'
        chai.expect(msg.payload.language).to.be.oneOf [
          'javascript'
          'coffeescript'
        ]
        chai.expect(msg.payload.code).to.be.a 'string'
        done()
      client.send 'component', 'getsource', payload

  describe 'sending component:source', ->
    source = """
var noflo = require('noflo');
exports.getComponent = function () {
  return noflo.asComponent(Math.random);
};
    """
    before ->
      runtimeEvents = []
    after ->
      runtimeEvents = []
    it 'should fail without proper authentication', (done) ->
      payload =
        name: 'GetRandom'
        library: 'math'
        language: 'javascript'
        code: source
        tests: ''
      client.once 'message', (msg) ->
        chai.expect(msg.protocol).to.equal 'component'
        chai.expect(msg.command).to.equal 'error'
        done()
      client.send 'component', 'source', payload
    it 'should not have emitted updated events', ->
      chai.expect(runtimeEvents).to.eql []
    it 'should respond with a new component', (done) ->
      payload =
        name: 'GetRandom'
        library: 'math'
        language: 'javascript'
        code: source
        tests: ''
        secret: 'foo'
      client.once 'message', (msg) ->
        chai.expect(msg.protocol).to.equal 'component'
        chai.expect(msg.command).to.equal 'component'
        chai.expect(msg.payload.name).to.equal 'math/GetRandom'
        done()
      client.send 'component', 'source', payload
    it 'should have emitted a updated event', ->
      chai.expect(runtimeEvents.length).to.equal 1
      event = runtimeEvents.shift()
      chai.expect(event.name).to.equal 'GetRandom'
      chai.expect(event.library).to.equal 'math'
      chai.expect(event.language).to.equal 'javascript'
      chai.expect(event.code).to.equal source
