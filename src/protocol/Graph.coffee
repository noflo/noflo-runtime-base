noflo = require 'noflo'

class GraphProtocol
  constructor: (@transport) ->
    @graphs = {}

  send: (topic, payload, context) ->
    @transport.send 'graph', topic, payload, context

  receive: (topic, payload, context) ->
    # Find locally stored graph by ID
    if topic isnt 'clear'
      graph = @resolveGraph payload, context
      return unless graph

    switch topic
      when 'clear' then @initGraph payload, context
      when 'addnode' then @addNode graph, payload, context
      when 'removenode' then @removeNode graph, payload, context
      when 'renamenode' then @renameNode graph, payload, context
      when 'addedge' then @addEdge graph, payload, context
      when 'removeedge' then @removeEdge graph, payload, context
      when 'addinitial' then @addInitial graph, payload, context
      when 'removeinitial' then @removeInitial graph, payload, context

  resolveGraph: (payload, context) ->
    unless payload.graph
      @send 'error', new Error('No graph specified'), context
      return
    unless @graphs[payload.graph]
      @send 'error', new Error('Requested graph not found'), context
      return
    return @graphs[payload.graph]

  initGraph: (payload, context) ->
    unless payload.id
      @send 'error', new Error('No graph ID provided'), context
      return
    unless payload.name
      payload.name = 'NoFlo runtime'

    graph = new noflo.Graph payload.name

    graph.baseDir = payload.baseDir
    # Allow override
    graph.baseDir = @transport.options.baseDir if @transport.options.baseDir

    @subscribeGraph payload.id, graph, context

    # Register to component loading
    @transport.component.registerGraph payload.id, graph, context

    @graphs[payload.id] = graph

  subscribeGraph: (id, graph, context) ->
    graph.on 'addNode', (node) =>
      node.graph = id
      @send 'addnode', node, context
    graph.on 'removeNode', (node) =>
      node.graph = id
      @send 'removenode', node, context
    graph.on 'renameNode', (oldId, newId) =>
      @send 'renamenode',
        from: oldId
        to: newId
        graph: id
      , context
    graph.on 'addEdge', (edge) =>
      edgeData =
        src: edge.from
        tgt: edge.to
        metadata: edge.metadata
        graph: id
      @send 'addedge', edgeData, context
    graph.on 'removeEdge', (edge) =>
      edgeData =
        src: edge.from
        tgt: edge.to
        metadata: edge.metadata
        graph: id
      @send 'removeedge', edgeData, context
    graph.on 'addInitial', (iip) =>
      iipData =
        src: iip.from
        tgt: iip.to
        metadata: iip.metadata
        graph: id
      @send 'addinitial', iipData, context
    graph.on 'removeInitial', (iip) =>
      iipData =
        src: iip.from
        tgt: iip.to
        metadata: iip.metadata
        graph: id
      @send 'removeinitial', iipData, context

  addNode: (graph, node, context) ->
    unless node.id or node.component
      @send 'error', new Error('No ID or component supplied'), context
    graph.addNode node.id, node.component, node.metadata

  removeNode: (graph, payload) ->
    unless payload.id
      @send 'error', new Error('No ID supplied'), context
    graph.removeNode payload.id

  renameNode: (graph, payload, context) ->
    unless payload.from or payload.to
      @send 'error', new Error('No from or to supplied'), context
    graph.renameNode payload.from, payload.to

  addEdge: (graph, edge, context) ->
    unless edge.src or edge.tgt
      @send 'error', new Error('No src or tgt supplied'), context
    graph.addEdge edge.src.node, edge.src.port, edge.tgt.node, edge.tgt.port, edge.metadata

  removeEdge: (graph, edge, context) ->
    unless edge.src or edge.tgt
      @send 'error', new Error('No src or tgt supplied'), context
    graph.removeEdge edge.src.node, edge.src.port, edge.tgt.node, edge.tgt.port

  addInitial: (graph, payload, context) ->
    unless payload.src or payload.tgt
      @send 'error', new Error('No src or tgt supplied'), context
    graph.addInitial payload.src.data, payload.tgt.node, payload.tgt.port, payload.metadata

  removeInitial: (graph, payload, context) ->
    unless payload.tgt
      @send 'error', new Error('No tgt supplied'), context
    graph.removeInitial payload.tgt.node, payload.tgt.port

module.exports = GraphProtocol
