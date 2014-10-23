noflo = require 'noflo'

if noflo.isBrowser()
  direct = require 'noflo-runtime-base/direct'
else
  chai = require 'chai' unless chai
  direct = require '../src/direct'

describe 'Runtime protocol', ->
  runtime = null
  client = null

  beforeEach ->
    runtime = new direct.Runtime
    client = new direct.Client runtime
    client.connect()
  afterEach ->
    client.disconnect()
    client = null
    runtime = null

  describe 'sending runtime:getruntime', ->
    it 'should respond with runtime:runtime', (done) ->
      client.once 'message', (msg) ->
        chai.expect(msg.protocol).to.equal 'runtime'
        chai.expect(msg.command).to.equal 'runtime'
        chai.expect(msg.payload.type).to.have.string 'noflo'
        chai.expect(msg.payload.capabilities).to.include 'protocol:graph'
        done()
      client.send 'runtime', 'getruntime', null
