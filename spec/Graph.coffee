noflo = require 'noflo'

if noflo.isBrowser()
  direct = require('noflo-runtime-base').direct
else
  chai = require 'chai' unless chai
  direct = require '../direct'

describe 'Graph protocol', ->
  runtime = null
  client = null
  client2 = null

  beforeEach ->
    runtime = new direct.Runtime
      permissions:
        foo: ['protocol:graph']
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

  describe 'sending graph:clear', ->
    it 'should fail without proper authentication', (done) ->
      payload =
        id: 'mygraph'
        main: true
      client.once 'message', (msg) ->
        chai.expect(msg.protocol).to.equal 'graph'
        chai.expect(msg.command).to.equal 'error'
        done()
      client.send 'graph', 'clear', payload
    it 'should respond with graph:clear', (done) ->
      payload =
        id: 'mygraph'
        main: true
        secret: 'foo'
      client.once 'message', (msg) ->
        chai.expect(msg.protocol).to.equal 'graph'
        chai.expect(msg.command).to.equal 'clear'
        chai.expect(msg.payload).to.include.keys 'id'
        chai.expect(msg.payload.id).to.equal payload.id
        done()
      client.send 'graph', 'clear', payload
    it 'should send to all clients', (done) ->
      payload =
        id: 'mygraph'
        main: true
        secret: 'foo'
      client2.once 'message', (msg) ->
        chai.expect(msg.protocol).to.equal 'graph'
        chai.expect(msg.command).to.equal 'clear'
        chai.expect(msg.payload).to.include.keys 'id'
        chai.expect(msg.payload.id).to.equal payload.id
        done()
      client.send 'graph', 'clear', payload

  describe 'sending graph:addnode', ->
    graph = 'graphwithnodes'
    payload =
      id: 'node1'
      component: 'Component1'
      graph: graph
      metadata: {}
    authenticatedPayload = JSON.parse JSON.stringify payload
    authenticatedPayload.secret = 'foo'
    checkAddNode = (msg, done) ->
      return if msg.command != 'addnode'
      chai.expect(msg.protocol).to.equal 'graph'
      chai.expect(msg.command).to.equal 'addnode'
      chai.expect(msg.payload).to.deep.equal payload
      done()
    it 'should respond with graph:addnode', (done) ->
      client.on 'message', (msg) -> checkAddNode msg, done
      client.send 'graph', 'clear', { id: graph, main: true, secret: 'foo'}
      client.send 'graph', 'addnode', authenticatedPayload
    it 'should send to all clients', (done) ->
      client2.on 'message', (msg) -> checkAddNode msg, done
      client.send 'graph', 'clear', { id: graph, main: true, secret: 'foo' }
      client.send 'graph', 'addnode', authenticatedPayload
