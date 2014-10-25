noflo = require 'noflo'
EventEmitter = require('events').EventEmitter

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
    unless noflo.isBrowser()
      if Buffer.isBuffer event.data
        # Make sure we're not trying to serialize the whole buffer to JSON
        event.data = event.data.slice 0, 20
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

class NetworkProtocol extends EventEmitter
  constructor: (@transport) ->
    @networks = {}

  send: (topic, payload, context) ->
    @transport.send 'network', topic, payload, context

  sendAll: (topic, payload) ->
    @transport.sendAll 'network', topic, payload

  receive: (topic, payload, context) ->
    if topic isnt 'list'
      graph = @resolveGraph payload, context
      return unless graph

    switch topic
      when 'start'
        @startNetwork graph, payload, context
      when 'stop'
        @stopNetwork graph, payload, context
      when 'edges'
        @updateEdgesFilter graph, payload, context
      when 'debug'
        @debugNetwork graph, payload, context
      when 'getstatus'
        @getStatus graph, payload, context

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
    if network
      network.filters = {}
    else
      network =
        network: null
        filters: {}
      @networks[payload.graph] = network

    for edge in payload.edges
      signature = getEdgeSignature(edge)
      network.filters[signature] = true

  eventFiltered: (graph, event) ->
    return true unless @transport.options.filterData
    sign = getSocketSignature(event.socket)
    return @networks[graph].filters[sign]

  initNetwork: (graph, payload, context) ->

    # Ensure we stop previous network
    if @networks[payload.graph]
      network = @networks[payload.graph].network
      network.stop()
      delete @networks[payload.graph]
      @emit 'removenetwork', network, @networks

    graph.componentLoader = @transport.component.getLoader graph.baseDir
    noflo.createNetwork graph, (network) =>
      if @networks[payload.graph]
        @networks[payload.graph].network = network
      else
        @networks[payload.graph] =
          network: network
          filters: {}
      @emit 'addnetwork', network, @networks
      @subscribeNetwork network, payload, context

      # Run the network
      network.connect ->
        network.start()
    , true

  subscribeNetwork: (network, payload, context) ->
    network.on 'start', (event) =>
      @sendAll 'started',
        time: event.start
        graph: payload.graph
        running: true
        started: network.isStarted()
      , context
    network.on 'end', (event) =>
      @sendAll 'stopped',
        time: new Date
        uptime: event.uptime
        graph: payload.graph
        running: false
        started: network.isStarted()
      , context
    network.on 'icon', (event) =>
      event.graph = payload.graph
      @sendAll 'icon', event, context
    network.on 'connect', (event) =>
      @sendAll 'connect', prepareSocketEvent(event, payload), context
    network.on 'begingroup', (event) =>
      @sendAll 'begingroup', prepareSocketEvent(event, payload), context
    network.on 'data', (event) =>
      return unless @eventFiltered(payload.graph, event)
      @sendAll 'data', prepareSocketEvent(event, payload), context
    network.on 'endgroup', (event) =>
      @sendAll 'endgroup', prepareSocketEvent(event, payload), context
    network.on 'disconnect', (event) =>
      @sendAll 'disconnect', prepareSocketEvent(event, payload), context

    network.on 'process-error', (event) =>
      error = event.error.message
      # If we can get a backtrace, send 3 levels
      if event.error.stack
        bt = event.error.stack.split '\n'
        for i in [0..Math.min bt.length, 3]
          error += "\n#{bt[i]}"
      @sendAll 'processerror',
        id: event.id
        error: error
        graph: payload.graph
      , context

  startNetwork: (graph, payload, context) ->
    network = @networks[payload.graph]
    if network
      network.network.start()
    else
      @initNetwork graph, payload, context

  stopNetwork: (graph, payload, context) ->
    return unless @networks[payload.graph]
    @networks[payload.graph].network.stop()

  debugNetwork: (graph, payload, context) ->
    return unless @networks[payload.graph]
    net = @networks[payload.graph].network
    if net.setDebug?
      net.setDebug payload.enable
    else
      console.log 'Warning: Network.setDebug not supported. Update to newer NoFlo'

  getStatus: (graph, payload, context) ->
    network = @networks[payload.graph]
    return unless network
    if network.network.isRunning
      isRunning = network.network.isRunning()
    else
      isRunning = network.network.isStarted() and network.network.connectionCount > 0
    @send 'status',
        graph: payload.graph
        running: isRunning
        started: network.network.isStarted()
    , context

module.exports = NetworkProtocol
