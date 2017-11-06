noflo = require 'noflo'

class GraphProtocol
  constructor: (@transport) ->
    @graphs = {}

  send: (topic, payload, context) ->
    @transport.send 'graph', topic, payload, context

  sendAll: (topic, payload) ->
    @transport.sendAll 'graph', topic, payload

  receive: (topic, payload, context) ->
    unless @transport.canDo 'protocol:graph', payload.secret
      @send 'error', new Error("#{topic} not permitted"), context
      return

    # Find locally stored graph by ID
    if topic isnt 'clear'
      graph = @resolveGraph payload, context
      return unless graph

    switch topic
      when 'clear' then @initGraph payload, context
      when 'addnode' then @addNode graph, payload, context
      when 'removenode' then @removeNode graph, payload, context
      when 'renamenode' then @renameNode graph, payload, context
      when 'changenode' then @changeNode graph, payload, context
      when 'addedge' then @addEdge graph, payload, context
      when 'removeedge' then @removeEdge graph, payload, context
      when 'changeedge' then @changeEdge graph, payload, context
      when 'addinitial' then @addInitial graph, payload, context
      when 'removeinitial' then @removeInitial graph, payload, context
      when 'addinport' then @addInport graph, payload, context
      when 'removeinport' then @removeInport graph, payload, context
      when 'renameinport' then @renameInport graph, payload, context
      when 'addoutport' then @addOutport graph, payload, context
      when 'removeoutport' then @removeOutport graph, payload, context
      when 'renameoutport' then @renameOutport graph, payload, context
      when 'addgroup' then @addGroup graph, payload, context
      when 'removegroup' then @removeGroup graph, payload, context
      when 'renamegroup' then @renameGroup graph, payload, context
      when 'changegroup' then @changeGroup graph, payload, context

  resolveGraph: (payload, context) ->
    unless payload.graph
      @send 'error', new Error('No graph specified'), context
      return
    unless @graphs[payload.graph]
      @send 'error', new Error('Requested graph not found'), context
      return
    return @graphs[payload.graph]

  getLoader: (baseDir) ->
    @transport.component.getLoader baseDir, @transport.options

  sendGraph: (id, graph, context) ->
    payload =
      graph: id
      description: graph.toJSON()
    @send 'graph', payload, context

  initGraph: (payload, context) ->
    unless payload.id
      @send 'error', new Error('No graph ID provided'), context
      return
    unless payload.name
      payload.name = 'NoFlo runtime'

    graph = new noflo.Graph payload.name

    fullName = payload.id
    if payload.library
      payload.library = payload.library.replace 'noflo-', ''
      graph.properties.library = payload.library
      fullName = "#{payload.library}/#{fullName}"
    if payload.icon
      graph.properties.icon = payload.icon
    if payload.description
      graph.properties.description = payload.description

    # Pass the project baseDir
    graph.baseDir = @transport.options.baseDir

    @subscribeGraph payload.id, graph, context

    if payload.main
      # Register for runtime exported ports
      @transport.runtime.setMainGraph fullName, graph, context
    else
      # Register to component loading
      @transport.component.registerGraph fullName, graph, context

    @graphs[payload.id] = graph
    @sendAll 'clear',
      id: payload.id
      name: payload.name
      library: payload.library
      main: payload.main
      icon: payload.icon
      description: payload.description
    , context

  registerGraph: (id, graph) ->
    @transport.runtime.setMainGraph id, graph if id == 'default/main'
    @subscribeGraph id, graph, ''
    @graphs[id] = graph

  subscribeGraph: (id, graph, context) ->
    graph.on 'addNode', (node) =>
      node.graph = id
      @sendAll 'addnode', node, context
    graph.on 'removeNode', (node) =>
      nodeData =
        id: node.id
        graph: id
      @sendAll 'removenode', nodeData, context
    graph.on 'renameNode', (oldId, newId) =>
      @sendAll 'renamenode',
        from: oldId
        to: newId
        graph: id
      , context
    graph.on 'changeNode', (node, before) =>
      @sendAll 'changenode',
        id: node.id
        metadata: node.metadata
        graph: id
      , context
    graph.on 'addEdge', (edge) =>
      delete edge.from.index unless typeof edge.from.index is 'number'
      delete edge.to.index unless typeof edge.to.index is 'number'
      edgeData =
        src: edge.from
        tgt: edge.to
        metadata: edge.metadata
        graph: id
      @sendAll 'addedge', edgeData, context
    graph.on 'removeEdge', (edge) =>
      edgeData =
        src: edge.from
        tgt: edge.to
        graph: id
      @sendAll 'removeedge', edgeData, context
    graph.on 'changeEdge', (edge) =>
      edgeData =
        src: edge.from
        tgt: edge.to
        metadata: edge.metadata
        graph: id
      @sendAll 'changeedge', edgeData, context
    graph.on 'addInitial', (iip) =>
      iipData =
        src: iip.from
        tgt: iip.to
        metadata: iip.metadata
        graph: id
      @sendAll 'addinitial', iipData, context
    graph.on 'removeInitial', (iip) =>
      iipData =
        src: iip.from
        tgt: iip.to
        graph: id
      @sendAll 'removeinitial', iipData, context
    graph.on 'addGroup', (group) =>
      groupData =
        name: group.name
        nodes: group.nodes
        metadata: group.metadata
        graph: id
      @sendAll 'addgroup', groupData, context
    graph.on 'removeGroup', (group) =>
      groupData =
        name: group.name
        graph: id
      @sendAll 'removegroup', groupData, context
    graph.on 'renameGroup', (oldName, newName) =>
      groupData =
        from: oldName
        to: newName
        graph: id
      @sendAll 'renamegroup', groupData, context
    graph.on 'changeGroup', (group) =>
      groupData =
        name: group.name
        metadata: group.metadata
        graph: id
      @sendAll 'changegroup', groupData, context
    graph.on 'addInport', (publicName, port) =>
      data =
        public: publicName
        node: port.process
        port: port.port
        metadata: port.metadata
        graph: id
      @sendAll 'addinport', data, context
    graph.on 'addOutport', (publicName, port) =>
      data =
        public: publicName
        node: port.process
        port: port.port
        metadata: port.metadata
        graph: id
      @sendAll 'addoutport', data, context
    graph.on 'removeInport', (publicName, port) =>
      data =
        public: publicName
        graph: id
        #node: port.process
        #port: port.port
        #metadata: port.metadata
      @sendAll 'removeinport', data, context
    graph.on 'removeOutport', (publicName, port) =>
      data =
        public: publicName
        graph: id
        #node: port.process
        #port: port.port
        #metadata: port.metadata
      @sendAll 'removeoutport', data, context

  addNode: (graph, node, context) ->
    unless node.id or node.component
      @send 'error', new Error('No ID or component supplied'), context
      return
    graph.addNode node.id, node.component, node.metadata

  removeNode: (graph, payload, context) ->
    unless payload.id
      @send 'error', new Error('No ID supplied'), context
      return
    graph.removeNode payload.id

  renameNode: (graph, payload, context) ->
    unless payload.from or payload.to
      @send 'error', new Error('No from or to supplied'), context
      return
    graph.renameNode payload.from, payload.to

  changeNode: (graph, payload, context) ->
    unless payload.id or payload.metadata
      @send 'error', new Error('No id or metadata supplied'), context
      return
    graph.setNodeMetadata payload.id, payload.metadata

  addEdge: (graph, edge, context) ->
    unless edge.src or edge.tgt
      @send 'error', new Error('No src or tgt supplied'), context
      return
    if typeof edge.src.index is 'number' or typeof edge.tgt.index is 'number'
      if graph.addEdgeIndex
        graph.addEdgeIndex edge.src.node, edge.src.port, edge.src.index, edge.tgt.node, edge.tgt.port, edge.tgt.index, edge.metadata
        return
    graph.addEdge edge.src.node, edge.src.port, edge.tgt.node, edge.tgt.port, edge.metadata

  removeEdge: (graph, edge, context) ->
    unless edge.src or edge.tgt
      @send 'error', new Error('No src or tgt supplied'), context
      return
    graph.removeEdge edge.src.node, edge.src.port, edge.tgt.node, edge.tgt.port

  changeEdge: (graph, edge, context) ->
    unless edge.src or edge.tgt
      @send 'error', new Error('No src or tgt supplied'), context
      return
    graph.setEdgeMetadata edge.src.node, edge.src.port, edge.tgt.node, edge.tgt.port, edge.metadata

  addInitial: (graph, payload, context) ->
    unless payload.src or payload.tgt
      @send 'error', new Error('No src or tgt supplied'), context
      return
    if graph.addInitialIndex and typeof payload.tgt.index is 'number'
      graph.addInitialIndex payload.src.data, payload.tgt.node, payload.tgt.port, payload.tgt.index, payload.metadata
      return
    graph.addInitial payload.src.data, payload.tgt.node, payload.tgt.port, payload.metadata

  removeInitial: (graph, payload, context) ->
    unless payload.tgt
      @send 'error', new Error('No tgt supplied'), context
      return
    graph.removeInitial payload.tgt.node, payload.tgt.port

  addInport: (graph, payload, context) ->
    unless payload.public or payload.node or payload.port
      @send 'error', new Error('Missing exported inport information'), context
      return
    graph.addInport payload.public, payload.node, payload.port, payload.metadata

  removeInport: (graph, payload, context) ->
    unless payload.public
      @send 'error', new Error('Missing exported inport name'), context
      return
    graph.removeInport payload.public

  renameInport: (graph, payload, context) ->
    unless payload.from or payload.to
      @send 'error', new Error('No from or to supplied'), context
      return
    graph.renameInport payload.from, payload.to

  addOutport: (graph, payload, context) ->
    unless payload.public or payload.node or payload.port
      @send 'error', new Error('Missing exported outport information'), context
      return
    graph.addOutport payload.public, payload.node, payload.port, payload.metadata

  removeOutport: (graph, payload, context) ->
    unless payload.public
      @send 'error', new Error('Missing exported outport name'), context
      return
    graph.removeOutport payload.public

  renameOutport: (graph, payload, context) ->
    unless payload.from or payload.to
      @send 'error', new Error('No from or to supplied'), context
      return
    graph.renameOutport payload.from, payload.to

  addGroup: (graph, payload, context) ->
    unless payload.name or payload.nodes or payload.metadata
      @send 'error', new Error('No name or nodes or metadata supplied'), context
      return
    graph.addGroup payload.name, payload.nodes, payload.metadata

  removeGroup: (graph, payload, context) ->
    unless payload.name
      @send 'error', new Error('No name supplied'), context
      return
    graph.removeGroup payload.name

  renameGroup: (graph, payload, context) ->
    unless payload.from or payload.to
      @send 'error', new Error('No from or to supplied'), context
      return
    graph.renameGroup payload.from, payload.to

  changeGroup: (graph, payload, context) ->
    unless payload.name or payload.metadata
      @send 'error', new Error('No name or metadata supplied'), context
      return
    graph.setEdgeMetadata payload.name, payload.metadata

module.exports = GraphProtocol
