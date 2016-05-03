noflo = require 'noflo'

sendToInport = (component, portName, event, payload) ->
  socket = noflo.internalSocket.createSocket()
  port = component.inPorts[portName]
  port.attach socket
  switch event
    when 'connect' then socket.connect()
    when 'disconnect' then socket.disconnect()
    when 'begingroup' then socket.beginGroup payload
    when 'endgroup' then socket.endGroup payload
    when 'data' then socket.post payload
  port.detach socket

portsPayload = (name, graph) ->
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
  payload =
    graph: name
    inPorts: inports
    outPorts: outports

class RuntimeProtocol
  constructor: (@transport) ->
    @outputSockets = {} # graphName -> publicPort -> noflo.Socket
    @mainGraph = null

    @transport.network.on 'addnetwork', (network, name) =>
      @subscribeExportedPorts name, network.graph, true
      @subscribeOutPorts name, network
      @sendPorts name, network.graph

      if network.isStarted()
        # processes don't exist until started
        @subscribeOutdata name, network, true
      network.on 'start', () =>
        # processes don't exist until started
        @subscribeOutdata name, network, true

    @transport.network.on 'removenetwork', (network, name) =>
      @subscribeOutdata name, network, false
      @subscribeOutPorts name, network
      @subscribeExportedPorts name, network.graph, false
      @sendPorts name, null

  send: (topic, payload, context) ->
    @transport.send 'runtime', topic, payload, context

  sendAll: (topic, payload) ->
    @transport.sendAll 'runtime', topic, payload

  sendError: (message, context) ->
    @send 'error', new Error(message), context

  receive: (topic, payload, context) ->
    if topic is 'packet' and not @transport.canDo 'protocol:runtime', payload.secret
      @send 'error', new Error("#{topic} not permitted"), context
      return

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

    permittedCapabilities = capabilities.filter (capability) =>
      @transport.canDo capability, payload.secret

    payload =
      type: type
      version: @transport.version
      capabilities: permittedCapabilities
      allCapabilities: capabilities
    payload.graph = @mainGraph if @mainGraph

    @send 'runtime', payload, context
    # send port info about currently set up networks
    for name, network of @transport.network.networks
      @sendPorts name, network.graph, context

  sendPorts: (name, graph, context) ->
    payload = portsPayload name, graph
    if not context
      @sendAll 'ports', payload
    else
      @send 'ports', payload, context

  setMainGraph: (id) ->
    @mainGraph = id
    # XXX: should send updated runtime info?

  subscribeExportedPorts: (name, graph, add) ->
    sendExportedPorts = () =>
      @sendPorts name, graph

    dependencies = [
      'addInport'
      'addOutport'
      'removeInport'
      'removeOutport'
    ]
    for d in dependencies
      graph.removeListener d, sendExportedPorts

    if add
      for d in dependencies
        graph.on d, sendExportedPorts

  subscribeOutPorts: (name, network, add) ->
    portRemoved = () =>
      @subscribeOutdata name, network, false
    portAdded = () =>
      @subscribeOutdata name, network, true

    graph = network.graph
    graph.removeListener 'addOutport', portAdded
    graph.removeListener 'removeOutport', portRemoved

    if add
      graph.on 'addOutport', portAdded
      graph.on 'removeOutport', portRemoved

  subscribeOutdata: (graphName, network, add) ->

    events = [
      'data'
      'begingroup'
      'endgroup'
      'connect'
      'disconnect'
    ]

    # Unsubscribe all
    @outputSockets[graphName] = {} if not @outputSockets[graphName]
    graphSockets = @outputSockets[graphName]
    for pub, socket of graphSockets
      for event in events
        socket.removeAllListeners event
    graphSockets = {}

    return if not add
    # Subscribe new
    Object.keys(network.graph.outports).forEach (pub) =>
      internal = network.graph.outports[pub]
      socket = noflo.internalSocket.createSocket()
      graphSockets[pub] = socket
      component = network.processes[internal.process].component
      component.outPorts[internal.port].attach socket
      sendFunc = (event) =>
        (payload) =>
          @sendAll 'packet',
            port: pub
            event: event
            graph: graphName
            payload: payload
      for event in events
        socket.on event, sendFunc event

  receivePacket: (payload, context) ->
    graph = @transport.graph.graphs[payload.graph]
    network = @transport.network.networks[payload.graph]
    return @sendError "Cannot find network for graph #{payload.graph}", context if not network

    internal = graph.inports[payload.port]
    component = network.network.getNode(internal?.process)?.component
    return @sendError "Cannot find internal port for #{payload.port}", context if not (internal and component)

    sendToInport component, internal.port, payload.event, payload.payload

module.exports = RuntimeProtocol
