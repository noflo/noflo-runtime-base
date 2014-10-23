noflo = require 'noflo'

if noflo.isBrowser()
  direct = require 'noflo-runtime-base/direct'
else
  chai = require 'chai' unless chai
  direct = require '../src/direct'

describe 'Graph protocol', ->
  runtime = null
  client = null
  client2 = null

  beforeEach ->
    runtime = new direct.Runtime
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
    it 'should respond with graph:clear', (done) ->
      payload =
        id: 'mygraph'
        main: true
      client.on 'message', (msg) ->
        chai.expect(msg.protocol).to.equal 'graph'
        chai.expect(msg.command).to.equal 'clear'
        chai.expect(msg.payload).to.include.keys 'id'
        chai.expect(msg.payload.id).to.equal payload.id
        done()
      client.send 'graph', 'clear', payload
    it.skip 'should send to all clients', (done) ->
      payload =
        id: 'mygraph'
        main: true
      client2.on 'message', (msg) ->
        chai.expect(msg.protocol).to.equal 'graph'
        chai.expect(msg.command).to.equal 'clear'
        chai.expect(msg.payload).to.include.keys 'id'
        chai.expect(msg.payload.id).to.equal payload.id
        done()
      client.send 'graph', 'clear', payload
