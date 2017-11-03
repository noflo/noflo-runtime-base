isBrowser = ->
  !(typeof process isnt 'undefined' and process.execPath and process.execPath.indexOf('node') isnt -1)

Base = require './Base'
EventEmitter = require('events').EventEmitter

class DirectRuntime extends Base
  constructor: (options) ->
    super options
    @clients = []

  _connect: (client) ->
    @clients.push client
    client.on 'send', (msg) =>
      # Capture context
      @_receive msg, { client: client }

  _disconnect: (client) ->
    return if (@clients.indexOf(client) == -1)
    @clients.splice @clients.indexOf(client), 1
    client.removeAllListeners 'send' # XXX: a bit heavy

  _receive: (msg, context) ->
    # Forward to Base
    @receive msg.protocol, msg.command, msg.payload, context

  send: (protocol, topic, payload, context) ->
    return if not context.client
    m =
      protocol: protocol
      command: topic
      payload: payload
    context.client._receive m

  sendAll: (protocol, topic, payload) ->
    m =
      protocol: protocol
      command: topic
      payload: payload
    for client in @clients
      client._receive m
    
# Mostly used for testing
class DirectClient extends EventEmitter
  constructor: (runtime, name) ->
    super()
    @name = name
    @runtime = runtime
    @name = 'Unnamed client' if not @name

  connect: () ->
    @runtime._connect this

  disconnect: () ->
    @runtime._disconnect this

  send: (protocol, topic, payload) ->
    m =
      protocol: protocol
      command: topic
      payload: payload
    @emit 'send', m

  _receive: (message) ->
    setTimeout =>
      @emit 'message', message
    , 1

exports.Client = DirectClient
exports.Runtime = DirectRuntime
