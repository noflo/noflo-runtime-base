noflo = require 'noflo'

class ComponentProtocol
  loaders: {}
  constructor: (@transport) ->

  send: (topic, payload, context) ->
    @transport.send 'component', topic, payload, context

  receive: (topic, payload, context) ->
    switch topic
      when 'list' then @listComponents payload, context
      when 'getsource' then @getSource payload, context
      when 'source' then @setSource payload, context

  getLoader: (baseDir) ->
    unless @loaders[baseDir]
      @loaders[baseDir] = new noflo.ComponentLoader baseDir

    return @loaders[baseDir]

  listComponents: (payload, context) ->
    baseDir = @transport.options.baseDir
    loader = @getLoader baseDir
    loader.listComponents (components) =>
      Object.keys(components).forEach (component) =>
        @processComponent loader, component, context

  getSource: (payload, context) ->

  setSource: (payload, context) ->
    source = payload.code
    if payload.language is 'coffeescript'
      # See if we have a CoffeeScript compiler available
      unless window.CoffeeScript
        # TODO: Error message?
        return
      try
        source = CoffeeScript.compile payload.code,
          bare: true
      catch e
        @send 'error', new Error("#{payload.name} L#{e.location.first_line}, C#{e.location.first_column}: #{e.message}"), context
        return
    # Quick-and-Dirty initial take before ComponentLoader does this
    # Set the source to the loader
    implementation = eval "(function () { var exports = {}; #{source}; return exports; })()"
    unless implementation or implementation.getComponent
      @send 'error', new Error("#{payload.name}: No component implementation available"), context
      return
    library = if payload.library then payload.library else ''
    fullName = payload.name
    fullName = "#{library}/#{fullName}" if library
    Object.keys(@loaders).forEach (baseDir) =>
      loader = @getLoader baseDir
      loader.listComponents (components) =>
        loader.registerComponent library, payload.name, implementation
        @processComponent loader, fullName, context

  processComponent: (loader, component, context) ->
    loader.load component, (instance) =>
      # Ensure graphs are not run automatically when just querying their ports
      unless instance.isReady()
        instance.once 'ready', =>
          @sendComponent component, instance, context
        return
      @sendComponent component, instance, context
    , true

  sendComponent: (component, instance, context) ->
    inPorts = []
    outPorts = []
    for portName, port of instance.inPorts
      continue if not port or typeof port is 'function' or not port.canAttach
      inPorts.push
        id: portName
        type: port.getDataType() if port.getDataType
        required: port.isRequired() if port.isRequired
        addressable: port.isAddressable() if port.isAddressable
        description: port.getDescription() if port.getDescription
    for portName, port of instance.outPorts
      continue if not port or typeof port is 'function' or not port.canAttach
      outPorts.push
        id: portName
        type: port.getDataType() if port.getDataType
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
    send = => @processComponent loader, id, context
    loader = @getLoader graph.baseDir
    loader.listComponents (components) =>
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

module.exports = ComponentProtocol
