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

  describe 'sending getruntime', ->
    it 'should respond with runtime', () ->
      client.on 'message', (msg) ->
        chai.expect(msg.protocol).to.equal 'runtime'
        chai.expect(msg.command).to.equal 'runtime'
        chai.expect(msg.type).to.equal 'noflo'
        chai.expect(msg.capabilities).keys.to.include 'protocol:graph'
      client.send 'runtime', 'getruntime', null
