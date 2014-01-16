noflo = require 'noflo'

class ComponentProtocol
  constructor: (@transport) ->

  send: (topic, payload, context) ->
    @transport.send 'component', topic, payload, context

  receive: (topic, payload, context) ->
    switch topic
      when 'list' then @listComponents payload, context

  listComponents: (baseDir, context) ->
    # Allow override
    baseDir = @transport.options.baseDir if @transport.options.baseDir

    loader = new noflo.ComponentLoader baseDir
    loader.listComponents (components) =>
      Object.keys(components).forEach (component) =>
        @processComponent loader, component, context

  processComponent: (loader, component, context) ->
    loader.load component, (instance) =>
      unless instance.isReady()
        instance.once 'ready', =>
          @sendComponent component, instance, context
        return
      @sendComponent component, instance, context

  sendComponent: (component, instance, context) ->
    inPorts = []
    outPorts = []
    for portName, port of instance.inPorts
      inPorts.push
        id: portName
        type: port.type
        array: port instanceof noflo.ArrayPort
    for portName, port of instance.outPorts
      outPorts.push
        id: portName
        type: port.type
        array: port instanceof noflo.ArrayPort

    icon = if instance.getIcon then instance.getIcon() else 'blank'

    @send 'component',
      name: component
      description: instance.description
      icon: icon
      inPorts: inPorts
      outPorts: outPorts
    , context

  registerGraph: (id, graph, context) ->
    send = => @processComponent loader, id, context

    loader = new noflo.ComponentLoader graph.baseDir
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
