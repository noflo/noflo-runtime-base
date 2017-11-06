noflo = require 'noflo'
debounce = require 'debounce'
utils = require '../utils'

class ComponentProtocol
  loaders: {}
  constructor: (@transport) ->

  send: (topic, payload, context) ->
    @transport.send 'component', topic, payload, context

  receive: (topic, payload, context) ->
    unless @transport.canDo 'protocol:component', payload.secret
      @send 'error', new Error("#{topic} not permitted"), context
      return

    if topic is 'source' and not @transport.canDo 'component:setsource', payload.secret
      @send 'error', new Error("#{topic} not permitted"), context
      return

    if topic is 'getsource' and not @transport.canDo 'component:getsource', payload.secret
      @send 'error', new Error("#{topic} not permitted"), context
      return

    switch topic
      when 'list' then @listComponents payload, context
      when 'getsource' then @getSource payload, context
      when 'source' then @setSource payload, context

  getLoader: (baseDir, options = {}) ->
    unless @loaders[baseDir]
      @loaders[baseDir] = new noflo.ComponentLoader baseDir, options

    return @loaders[baseDir]

  listComponents: (payload, context) ->
    baseDir = @transport.options.baseDir
    loader = @getLoader baseDir, @transport.options
    loader.listComponents (err, components) =>
      if err
        @send 'error', err, context
        return
      componentNames = Object.keys components
      processed = 0
      componentNames.forEach (component) =>
        @processComponent loader, component, context, (err) =>
          processed++
          return if processed < componentNames.length
          @send 'componentsready', processed, context

  getSource: (payload, context) ->
    baseDir = @transport.options.baseDir
    loader = @getLoader baseDir, @transport.options
    loader.getSource payload.name, (err, component) =>
      if err
        # Try one of the registered graphs
        graph = @transport.graph.graphs[payload.name]
        unless graph?
          @send 'error', err, context
          return

        nameParts = utils.parseName payload.name
        @send 'source',
          name: nameParts.name
          library: nameParts.library
          code: JSON.stringify graph.toJSON()
          language: 'json'
        , context
      else
        @send 'source', component, context

  setSource: (payload, context) ->
    baseDir = @transport.options.baseDir
    loader = @getLoader baseDir, @transport.options
    loader.setSource payload.library, payload.name, payload.code, payload.language, (err) =>
      if err
        @send 'error', err, context
        return
      @processComponent loader, loader.normalizeName(payload.library, payload.name), context

  processComponent: (loader, component, context, callback) ->
    unless callback
      callback = ->

    loader.load component, (err, instance) =>
      unless instance
        if err instanceof Error
          @send 'error', err, context
          return callback err
        instance = err

      # Ensure graphs are not run automatically when just querying their ports
      unless instance.isReady()
        instance.once 'ready', =>
          @sendComponent component, instance, context
          callback null
        return
      @sendComponent component, instance, context
      callback null
    , true

  sendComponent: (component, instance, context) ->
    inPorts = []
    outPorts = []
    for portName, port of instance.inPorts
      continue if not port or typeof port is 'function' or not port.canAttach
      inPorts.push
        id: portName
        type: port.getDataType() if port.getDataType
        schema: port.getSchema() if port.getSchema
        required: port.isRequired() if port.isRequired
        addressable: port.isAddressable() if port.isAddressable
        description: port.getDescription() if port.getDescription
        values: port.options.values if port.options and port.options.values
        default: port.options.default if port.options and port.options.default
    for portName, port of instance.outPorts
      continue if not port or typeof port is 'function' or not port.canAttach
      outPorts.push
        id: portName
        type: port.getDataType() if port.getDataType
        schema: port.getSchema() if port.getSchema
        required: port.isRequired() if port.isRequired
        addressable: port.isAddressable() if port.isAddressable
        description: port.getDescription() if port.getDescription

    icon = if instance.getIcon then instance.getIcon() else 'blank'

    @send 'component',
      name: component
      description: instance.description
      subgraph: instance.isSubgraph()
      icon: icon
      inPorts: inPorts
      outPorts: outPorts
    , context

  registerGraph: (id, graph, context) ->
    sender = => @processComponent loader, id, context
    send = debounce sender, 10
    loader = @getLoader graph.baseDir, @transport.options
    loader.listComponents (err, components) =>
      if err
        @send 'error', err, context
        return
      loader.registerComponent '', id, graph
      # Send initial graph info back to client
      do send

    # Send graph info again every time it changes so we get the updated ports
    graph.on 'addNode', send
    graph.on 'removeNode', send
    graph.on 'renameNode', send
    graph.on 'addEdge', send
    graph.on 'removeEdge', send
    graph.on 'addInitial', send
    graph.on 'removeInitial', send
    graph.on 'addInport', send
    graph.on 'removeInport', send
    graph.on 'renameInport', send
    graph.on 'addOutport', send
    graph.on 'removeOutport', send
    graph.on 'renameOutport', send

module.exports = ComponentProtocol
