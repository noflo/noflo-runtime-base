noflo = require 'noflo'
EventEmitter = require('events').EventEmitter
{ Tracer } = require '../trace'

# Handle the trace subprotocol, for creating and managing flowtrace
class TraceProtocol extends EventEmitter
  constructor: (@transport) ->
    @started = false
    @networks = {}
    @tracer = new Tracer {}

    @transport.network.on 'addnetwork', @addNetwork
    @transport.network.on 'removenetwork', @removeNetwork

  send: (topic, payload, context) ->
    @transport.send 'trace', topic, payload, context

  sendAll: (topic, payload) ->
    @transport.sendAll 'trace', topic, payload

  receive: (topic, payload, context) ->
    unless @transport.canDo 'protocol:trace', payload.secret
      @send 'error', new Error("#{topic} not permitted"), context
      return

    switch topic
      when 'start'
        if not @started
          for name, net of @networks
            @tracer.attach net
          @started = true

        @send data # ACK
      when 'stop'
        if @started
          for name, net of @networks
            @tracer.deattach net
          @started = false

        @send data # ACK
      when 'clear' # FIXME: implement
        null
        @send data
      when 'dump'
        @tracer.dumpString (err, trace) =>
          reply = common.clone data
          reply.payload.flowtrace = trace
          @send reply

    addNetwork: (net, name) ->
      @tracer.attach net
      @networks[name] = net

    removeNetwork: (net, name) ->
      @tracer.detach net
      delete @networks[name]

module.exports = NetworkProtocol
