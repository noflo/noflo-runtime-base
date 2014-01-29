noflo = require 'noflo'

prepareSocketEvent = (event, req) ->
  payload =
    id: event.id
    graph: req.graph
  if event.socket.from
    payload.src =
      node: event.socket.from.process.id
      port: event.socket.from.port
  if event.socket.to
    payload.tgt =
      node: event.socket.to.process.id
      port: event.socket.to.port
  if event.subgraph
    payload.subgraph = event.subgraph
  if event.group
    payload.group = event.group
  if event.data
    if event.data.toJSON
      payload.data = event.data.toJSON()
    if event.data.toString
      payload.data = event.data.toString()
      if payload.data is '[object Object]'
        try
          payload.data = JSON.parse JSON.stringify event.data
    else
      payload.data = event.data
  if event.subgraph
    payload.subgraph = event.subgraph
  payload

getPortSignature = (item) ->
  return '' unless item
  return item.process + '(' + item.port + ')'

getEdgeSignature = (edge) ->
  return getPortSignature(edge.src) + ' -> ' + getPortSignature(edge.tgt)

getConnectionSignature = (connection) ->
  return '' unless connection
  return connection.process.id + '(' + connection.port + ')'

getSocketSignature = (socket) ->
  return getConnectionSignature(socket.from) +  ' -> ' + getConnectionSignature(socket.to)

class NetworkProtocol
  constructor: (@transport) ->
    @networks = {}

  send: (topic, payload, context) ->
    @transport.send 'network', topic, payload, context

  receive: (topic, payload, context) ->
    graph = @resolveGraph payload, context
    return unless graph

    switch topic
      when 'start'
        @initNetwork graph, payload, context
      when 'stop'
        @stopNetwork graph, payload, context
      when 'edges'
        @updateEdgesFilter graph, payload, context

  resolveGraph: (payload, context) ->
    unless payload.graph
      @send 'error', new Error('No graph specified'), context
      return
    unless @transport.graph.graphs[payload.graph]
      @send 'error', new Error('Requested graph not found'), context
      return
    return @transport.graph.graphs[payload.graph]

  updateEdgesFilter: (graph, payload, context) ->
    network = @networks[payload.graph]
    return unless network

    network.filters = {}
    for edge in payload.edges
      signature = getEdgeSignature(edge)
      log('add signature : ' + signature)
      network.filters[signature] = true

  eventFiltered: (graph, event) ->
    sign = getSocketSignature(event.socket)
    if @networks[graph].filters[sign]
      log('event match for signature : ' + sign)
    #log('event signature : ' + sign)
    return @networks[graph].filters[sign]

  initNetwork: (graph, payload, context) ->
    graph.componentLoader = @transport.component.getLoader graph.baseDir
    noflo.createNetwork graph, (network) =>
      @networks[payload.graph] =
        network: network
        filters: {}
      @subscribeNetwork network, payload, context

      # Run the network
      network.connect ->
        network.sendInitials()
        graph.on 'addInitial', ->
          network.sendInitials()
    , true

  subscribeNetwork: (network, payload, context) ->
    network.on 'start', (event) =>
      @send 'started',
        time: event.start
        graph: payload.graph
      , context
    network.on 'icon', (event) =>
      event.graph = payload.graph
      @send 'icon', event, context
    network.on 'connect', (event) =>
      @send 'connect', prepareSocketEvent(event, payload), context
    network.on 'begingroup', (event) =>
      @send 'begingroup', prepareSocketEvent(event, payload), context
    network.on 'data', (event) =>
      return unless @eventFiltered(payload.graph, event)
      @send 'data', prepareSocketEvent(event, payload), context
    network.on 'endgroup', (event) =>
      @send 'endgroup', prepareSocketEvent(event, payload), context
    network.on 'disconnect', (event) =>
      @send 'disconnect', prepareSocketEvent(event, payload), context
    network.on 'end', (event) =>
      @send 'stopped',
        time: new Date
        uptime: event.uptime
        graph: payload.graph
      , context

  stopNetwork: (graph, payload, context) ->
    return unless @networks[payload.graph]
    @networks[payload.graph].network.stop()

module.exports = NetworkProtocol
