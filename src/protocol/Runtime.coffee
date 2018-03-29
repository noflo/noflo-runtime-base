noflo = require 'noflo'
EventEmitter = require('events').EventEmitter

sendToInport = (port, event, payload) ->
  socket = noflo.internalSocket.createSocket()
  port.attach socket
  switch event
    when 'begingroup' then socket.beginGroup payload
    when 'endgroup' then socket.endGroup payload
    when 'data' then socket.send payload
  port.detach socket

findPort = (network, name, inPort) ->
  return unless network.graph
  if inPort
    internal = network.graph.inports[name]
  else
    internal = network.graph.outports[name]
  return unless internal?.process
  component = network.getNode(internal.process)?.component
  return unless component
  return component.inPorts[internal.port] if inPort
  return component.outPorts[internal.port]

portToPayload = (pub, internal, network, inPort) ->
  def =
    id: pub
    type: 'all'
    description: internal.metadata?.description
    addressable: false
    required: false
  port = findPort network, pub, inPort
  # Network has been prepared but isn't running yet so
  # we don't have full component info
  return def unless port
  def.type = port.getDataType() or 'all'
  def.schema = port.getSchema() if port.getSchema?()
  def.description = internal.metadata?.description or port.getDescription() or ''
  def.addressable = port.isAddressable()
  def.required = port.isRequired()
  return def

portsPayload = (name, network) ->
  payload =
    graph: name
    inPorts: []
    outPorts: []
  return payload unless network?.graph
  for pub, internal of network.graph.inports
    payload.inPorts.push portToPayload pub, internal, network, true
  for pub, internal of network.graph.outports
    payload.outPorts.push portToPayload pub, internal, network, false
  return payload

class RuntimeProtocol extends EventEmitter
  constructor: (transport) ->
    super()
    @transport = transport
    @outputSockets = {} # graphName -> publicPort -> noflo.Socket
    @mainGraph = null

    @transport.network.on 'addnetwork', (network, name) =>
      @subscribeExportedPorts name, network, true
      @subscribeOutPorts name, network
      @sendPorts name, network

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
    switch topic
      when 'getruntime' then @getRuntime payload, context
      when 'packet'
        @sendPacket payload, (err) =>
          if err
            @sendError err.message, context
            return
          @send 'packetsent',
            port: payload.port
            event: payload.event
            graph: payload.graph
            payload: payload.payload
          , context
          return
      else @send 'error', new Error("runtime:#{topic} not supported"), context

  getRuntime: (payload, context) ->
    type = @transport.options.type
    unless type
      if noflo.isBrowser()
        type = 'noflo-browser'
      else
        type = 'noflo-nodejs'

    capabilities = @transport.options.capabilities
    permittedCapabilities = capabilities.filter (capability) =>
      @transport.canDo capability, payload.secret

    payload =
      type: type
      version: @transport.version
      capabilities: permittedCapabilities
      allCapabilities: capabilities
    payload.graph = @mainGraph if @mainGraph

    # Add project metadata if available
    payload.id = @transport.options.id if @transport.options.id
    payload.label = @transport.options.label if @transport.options.label
    payload.namespace = @transport.options.namespace if @transport.options.namespace
    payload.repository = @transport.options.repository if @transport.options.repository
    payload.repositoryVersion = @transport.options.repositoryVersion if @transport.options.repositoryVersion

    @send 'runtime', payload, context
    # send port info about currently set up networks
    for name, network of @transport.network.networks
      @sendPorts name, network, context

  sendPorts: (name, network, context) ->
    payload = portsPayload name, network
    @emit 'ports', payload
    if not context
      @sendAll 'ports', payload
    else
      @send 'ports', payload, context

  setMainGraph: (id) ->
    @mainGraph = id
    # XXX: should send updated runtime info?

  subscribeExportedPorts: (name, network, add) ->
    sendExportedPorts = () =>
      @sendPorts name, network

    dependencies = [
      'addInport'
      'addOutport'
      'removeInport'
      'removeOutport'
    ]
    for d in dependencies
      network.graph.removeListener d, sendExportedPorts

    if add
      for d in dependencies
        network.graph.on d, sendExportedPorts

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
      unless component?.outPorts[internal.port]
        throw new Error "Exported outport #{internal.port} in node #{internal.process} not found"
      component.outPorts[internal.port].attach socket
      socket.on 'ip', (ip) =>
        switch ip.type
          when 'openBracket'
            event = 'begingroup'
          when 'closeBracket'
            event = 'endgroup'
          else
            event = ip.type
        @emit 'packet',
          port: pub
          event: event
          graph: graphName
          payload: ip.data
        @sendAll 'packet',
          port: pub
          event: event
          graph: graphName
          payload: ip.data

  sendPacket: (payload, callback) ->
    network = @transport.network.networks[payload.graph]
    return callback new Error "Cannot find network for graph #{payload.graph}" if not network
    port = findPort network.network, payload.port, true
    return callback new Error "Cannot find internal port for #{payload.port}" if not port
    sendToInport port, payload.event, payload.payload
    callback()

module.exports = RuntimeProtocol
