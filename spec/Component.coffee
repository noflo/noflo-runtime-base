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

  beforeEach ->
    runtime = new direct.Runtime
      permissions:
        foo: [
          'protocol:component'
          'component:setsource'
          'component:getsource'
        ]
      baseDir: baseDir
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
