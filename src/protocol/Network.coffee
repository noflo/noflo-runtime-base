noflo = require 'noflo'

prepareSocketEvent = (event) ->
  payload =
    id: event.id
  if event.socket.from
    payload.from =
      node: event.socket.from.process.id
      port: event.socket.from.port
  if event.socket.to
    payload.to =
      node: event.socket.to.process.id
      port: event.socket.to.port
  if event.group
    payload.group = event.group
  if event.data
    if event.data.toJSON
      payload.data = event.data.toJSON()
    if event.data.toString
      payload.data = event.data.toString()
    else
      payload.data = event.data
  if event.subgraph
    payload.subgraph = event.subgraph
  payload

class NetworkProtocol
  constructor: (@transport) ->

  send: (topic, payload, context) ->
    @transport.send 'network', topic, payload, context

  receive: (topic, payload, context) ->
    switch topic
      when 'start'
        @initNetwork @transport.graph.graph, context

  initNetwork: (graph, context) ->
    unless graph
      @send 'error', new Error('No graph defined'), context
      return

    noflo.createNetwork graph, (network) =>
      @subscribeNetwork network, context
      # Run the network
      network.connect ->
        network.sendInitials()
        graph.on 'addInitial', ->
          network.sendInitials()
    , true

  subscribeNetwork: (network, context) ->
    network.on 'start', (event) =>
      @send 'start', event.start, context
    network.on 'connect', (event) =>
      @send 'connect', prepareSocketEvent(event), context
    network.on 'begingroup', (event) =>
      @send 'begingroup', prepareSocketEvent(event), context
    network.on 'data', (event) =>
      @send 'data', prepareSocketEvent(event), context
    network.on 'endgroup', (event) =>
      @send 'endgroup', prepareSocketEvent(event), context
    network.on 'disconnect', (event) =>
      @send 'disconnect', prepareSocketEvent(event), context
    network.on 'stop', (event) =>
      @send 'stop', event.uptime, context

module.exports = NetworkProtocol
