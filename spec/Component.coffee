noflo = require 'noflo'

if noflo.isBrowser()
  direct = require 'noflo-runtime-base/direct'
else
  chai = require 'chai' unless chai
  direct = require '../src/direct'

describe 'Component protocol', ->
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

  describe 'changing ports of component on ready', ->

noflo = require 'noflo'

class RemoteSubGraph extends noflo.Component

  constructor: (metadata) ->
    metadata = {} unless metadata

    @runtime = null
    @ready = true

    @inPorts = new noflo.InPorts
    @outPorts = new noflo.OutPorts
    # TODO: add connected/disconnected output port by default

  isReady: ->
    @ready
  setReady: (ready) ->
    @ready = ready
    @emit 'ready' if ready

  setNewPorts: (definition) ->
    @setReady false
    @description = 

    @inPorts.add name, {}, (event, packet) =>

    @setReady true


exports.RemoteSubGraph = RemoteSubGraph
exports.getComponent = (metadata) -> new RemoteSubGraph metadata

