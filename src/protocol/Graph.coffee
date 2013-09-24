noflo = require 'noflo'

class GraphProtocol
  constructor: (@transport) ->
    @graph = null

  send: (topic, payload, context) ->
    @transport.send 'graph', topic, payload, context

  receive: (topic, payload, context) ->
    switch topic
      when 'clear'
        @graph = @initGraph payload, context
      when 'addnode' then @addNode @graph, payload, context
      when 'removenode' then @removeNode @graph, payload, context
      when 'renamenode' then @renameNode @graph, payload, context
      when 'addedge' then @addEdge @graph, payload, context
      when 'removeedge' then @removeEdge @graph, payload, context
      when 'addinitial' then @addInitial @graph, payload, context
      when 'removeinitial' then @removeInitial @graph, payload, context

  initGraph: (payload, context) ->
    unless payload.baseDir
      @send 'error', new Error('No graph baseDir provided'), context
      return
    unless payload.name
      payload.name = 'NoFlo runtime'

    graph = new noflo.Graph payload.name
    graph.baseDir = payload.baseDir

    @subscribeGraph graph, context

    graph

  subscribeGraph: (graph, context) ->
    graph.on 'addNode', (node) =>
      @send 'addnode', node, context
    graph.on 'removeNode', (node) =>
      @send 'removenode', node, context
    graph.on 'renameNode', (oldId, newId) =>
      @send 'renamenode',
        from: oldId
        to: newId
      , context
    graph.on 'addEdge', (edge) =>
      @send 'addedge', edge, context
    graph.on 'removeEdge', (edge) =>
      @send 'removeedge', edge, context
    graph.on 'addInitial', (iip) =>
      @send 'addinitial', iip, context
    graph.on 'removeInitial', (iip) =>
      @send 'removeinitial', iip, context

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
    unless edge.from or edge.to
      @send 'error', new Error('No from or to supplied'), context
    graph.addEdge edge.from.node, edge.from.port, edge.to.node, edge.to.port

  removeEdge: (graph, edge, context) ->
    unless edge.from or edge.to
      @send 'error', new Error('No from or to supplied'), context
    graph.removeEdge edge.from.node, edge.from.port, edge.to.node, edge.to.port

  addInitial: (graph, payload, context) ->
    unless payload.from or payload.to
      @send 'error', new Error('No from or to supplied'), context
    graph.addInitial payload.from.data, payload.to.node, payload.to.port, payload.metadata

  removeInitial: (graph, payload, context) ->
    unless payload.to
      @send 'error', new Error('No to supplied'), context
    graph.removeInitial payload.to.node, payload.to.port

module.exports = GraphProtocol
