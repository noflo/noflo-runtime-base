noflo = require 'noflo'

class RuntimeProtocol
  constructor: (@transport) ->
    @mainGraph = null
    @outputSockets = {} # publicPort -> noflo.Socket


    @transport.network.on 'addnetwork', (network) =>
      network.on 'start', () =>
        # processes don't exist until started
        network = @getMainNetwork()
        @updateOutportSubscription network
      network.on 'data', (event) =>
        # TODO: use this instead of manually subscribing to output ports
    @transport.network.on 'removenetwork', () =>
      network = @getMainNetwork()
      @updateOutportSubscription network

  send: (topic, payload, context) ->
    @transport.send 'runtime', topic, payload, context

  sendAll: (topic, payload) ->
    @transport.sendAll 'runtime', topic, payload

  receive: (topic, payload, context) ->
    switch topic
      when 'getruntime' then @getRuntime payload, context
      when 'packet' then @receivePacket payload, context

  getRuntime: (payload, context) ->
    type = @transport.options.type
    unless type
      if noflo.isBrowser()
        type = 'noflo-browser'
      else
        type = 'noflo-nodejs'
    capabilities = @transport.options.capabilities
    unless capabilities
      capabilities = [
        'protocol:graph'
        'protocol:component'
        'protocol:network'
        'protocol:runtime'
        'component:setsource'
        'component:getsource'
      ]
    graph = undefined
    for k, v of @transport.network.networks
      graph = k
      break
    @send 'runtime',
      type: type
      version: @transport.version
      capabilities: capabilities
      graph: graph
    , context
    graphInstance = @transport.graph.graphs[graph]
    @sendPorts graph, graphInstance, context

  sendPorts: (name, graph, context) ->
    inports = []
    outports = []
    if graph
      for pub, internal of graph.inports
        inports.push
          id: pub
          type: 'any' # TODO: lookup on internal
          description: internal.metadata?.description
          addressable: false
          required: false
      for pub, internal of graph.outports
        outports.push
          id: pub
          type: 'any' # TODO: lookup on internal
          description: internal.metadata?.description
          addressable: false
          required: false

    @sendAll 'ports',
      graph: name
      inPorts: inports
      outPorts: outports
    , context

  getMainNetwork: () ->
    return null if not @mainGraph
    graphName = @mainGraph.name or @mainGraph.properties.id
    network = @transport.network.networks[graphName]
    return null if not network
    network = network.network
    return network

  setMainGraph: (id, graph, context) ->
    checkExportedPorts = (name, process, port, metadata) =>
      # don't care what changed, just resend all
      @sendPorts id, graph, context
      @updateOutportSubscription @getMainNetwork()
    dependencies = [
      'addInport'
      'addOutport'
      'removeInport'
      'removeOutport'
    ]
    if @mainGraph
      for d in dependencies
        @mainGraph.removeListener d, checkExportedPorts
    @mainGraph = graph
    for d in dependencies
      @mainGraph.on d, checkExportedPorts

  updateOutportSubscription: (network) ->
    return if not network

    events = [
      'data'
      'begingroup'
      'endgroup'
      'connect'
      'disconnect'
    ]

    # Unsubscribe all
    for pub, socket of @outputSockets
      for event in events
        socket.removeAllListeners event
    @outputSockets = {}

    # Subscribe new
    graphName = network.graph.name or network.graph.properties.id
    for pub, internal of network.graph.outports
      socket = noflo.internalSocket.createSocket()
      @outputSockets[pub] = socket
      component = network.processes[internal.process].component
      component.outPorts[internal.port].attach socket
      sendFunc = (event) =>
        (payload) =>
          @sendAll 'runtime', 'packet',
            port: pub
            event: event
            graph: graphName
            payload: payload
      for event in events
        socket.on event, sendFunc event

  receivePacket: (payload, context) ->
    return @send 'error', new Error('No main graph'), context if not @mainGraph

    graphName = @mainGraph.name or @mainGraph.properties.id

    network = @getMainNetwork()
    internal = @mainGraph.inports[payload.port]
    component = network.processes[internal.process].component

    socket = noflo.internalSocket.createSocket()
    port = component.inPorts[internal.port]
    port.attach socket
    switch payload.event
      when 'connect' then socket.connect()
      when 'disconnect' then socket.disconnect()
      when 'begingroup' then socket.beginGroup payload.payload
      when 'endgroup' then socket.endGroup payload.payload
      when 'data' then socket.send payload.payload
    port.detach socket

module.exports = RuntimeProtocol
