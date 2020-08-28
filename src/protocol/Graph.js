const noflo = require('noflo');
const {
  EventEmitter,
} = require('events');

class GraphProtocol extends EventEmitter {
  constructor(transport) {
    super();
    this.transport = transport;
    this.graphs = {};
  }

  send(topic, payload, context) {
    return this.transport.send('graph', topic, payload, context);
  }

  sendAll(topic, payload) {
    return this.transport.sendAll('graph', topic, payload);
  }

  receive(topic, payload, context) {
    // Find locally stored graph by ID
    let graph;
    if (topic !== 'clear') {
      graph = this.resolveGraph(payload, context);
      if (!graph) { return; }
    }

    switch (topic) {
      case 'clear': this.initGraph(payload, context); break;
      case 'addnode': this.addNode(graph, payload, context); break;
      case 'removenode': this.removeNode(graph, payload, context); break;
      case 'renamenode': this.renameNode(graph, payload, context); break;
      case 'changenode': this.changeNode(graph, payload, context); break;
      case 'addedge': this.addEdge(graph, payload, context); break;
      case 'removeedge': this.removeEdge(graph, payload, context); break;
      case 'changeedge': this.changeEdge(graph, payload, context); break;
      case 'addinitial': this.addInitial(graph, payload, context); break;
      case 'removeinitial': this.removeInitial(graph, payload, context); break;
      case 'addinport': this.addInport(graph, payload, context); break;
      case 'removeinport': this.removeInport(graph, payload, context); break;
      case 'renameinport': this.renameInport(graph, payload, context); break;
      case 'addoutport': this.addOutport(graph, payload, context); break;
      case 'removeoutport': this.removeOutport(graph, payload, context); break;
      case 'renameoutport': this.renameOutport(graph, payload, context); break;
      case 'addgroup': this.addGroup(graph, payload, context); break;
      case 'removegroup': this.removeGroup(graph, payload, context); break;
      case 'renamegroup': this.renameGroup(graph, payload, context); break;
      case 'changegroup': this.changeGroup(graph, payload, context); break;
      default: this.send('error', new Error(`graph:${topic} not supported`), context);
    }
  }

  resolveGraph(payload, context) {
    if (!payload.graph) {
      this.send('error', new Error('No graph specified'), context);
      return null;
    }
    if (!this.graphs[payload.graph]) {
      this.send('error', new Error('Requested graph not found'), context);
      return null;
    }
    return this.graphs[payload.graph];
  }

  getLoader(baseDir) {
    return this.transport.component.getLoader(baseDir, this.transport.options);
  }

  sendGraph(id, graph, context) {
    const payload = {
      graph: id,
      description: graph.toJSON(),
    };
    return this.send('graph', payload, context);
  }

  initGraph(payload, context) {
    if (!payload.id) {
      this.send('error', new Error('No graph ID provided'), context);
      return;
    }
    const graph = new noflo.Graph(payload.name || 'NoFlo runtime');

    let fullName = payload.id;
    let { library } = payload;
    if (library) {
      library = library.replace('noflo-', '');
      graph.properties.library = library;
      fullName = `${library}/${fullName}`;
    }
    if (payload.icon) {
      graph.properties.icon = payload.icon;
    }
    if (payload.description) {
      graph.properties.description = payload.description;
    }

    // Pass the project baseDir
    graph.baseDir = this.transport.options.baseDir;

    this.subscribeGraph(payload.id, graph, context);

    if (payload.main) {
      // Register for runtime exported ports
      this.transport.runtime.setMainGraph(fullName, graph, context);
    } else {
      // Register to component loading
      this.transport.component.registerGraph(fullName, graph, context);
    }

    this.graphs[payload.id] = graph;
    this.sendAll('clear', {
      id: payload.id,
      name: payload.name,
      library: payload.library,
      main: payload.main,
      icon: payload.icon,
      description: payload.description,
    },
    context);
  }

  registerGraph(id, graph) {
    if (id === 'default/main') { this.transport.runtime.setMainGraph(id, graph); }
    this.subscribeGraph(id, graph, '');
    this.graphs[id] = graph;
  }

  subscribeGraph(id, graph, context) {
    graph.on('addNode', (node) => {
      this.sendAll('addnode', {
        ...node,
        graph: id,
      }, context);
    });
    graph.on('removeNode', (node) => {
      const nodeData = {
        id: node.id,
        graph: id,
      };
      this.sendAll('removenode', nodeData, context);
    });
    graph.on('renameNode', (oldId, newId) => this.sendAll('renamenode', {
      from: oldId,
      to: newId,
      graph: id,
    },
    context));
    graph.on('changeNode', (node) => this.sendAll('changenode', {
      id: node.id,
      metadata: node.metadata,
      graph: id,
    },
    context));
    graph.on('addEdge', (edge) => {
      const edgeData = {
        src: edge.from,
        tgt: edge.to,
        metadata: edge.metadata,
        graph: id,
      };
      this.sendAll('addedge', edgeData, context);
    });
    graph.on('removeEdge', (edge) => {
      const edgeData = {
        src: edge.from,
        tgt: edge.to,
        graph: id,
      };
      this.sendAll('removeedge', edgeData, context);
    });
    graph.on('changeEdge', (edge) => {
      const edgeData = {
        src: edge.from,
        tgt: edge.to,
        metadata: edge.metadata,
        graph: id,
      };
      this.sendAll('changeedge', edgeData, context);
    });
    graph.on('addInitial', (iip) => {
      const iipData = {
        src: iip.from,
        tgt: iip.to,
        metadata: iip.metadata,
        graph: id,
      };
      this.sendAll('addinitial', iipData, context);
    });
    graph.on('removeInitial', (iip) => {
      const iipData = {
        src: iip.from,
        tgt: iip.to,
        graph: id,
      };
      this.sendAll('removeinitial', iipData, context);
    });
    graph.on('addGroup', (group) => {
      const groupData = {
        name: group.name,
        nodes: group.nodes,
        metadata: group.metadata,
        graph: id,
      };
      this.sendAll('addgroup', groupData, context);
    });
    graph.on('removeGroup', (group) => {
      const groupData = {
        name: group.name,
        graph: id,
      };
      this.sendAll('removegroup', groupData, context);
    });
    graph.on('renameGroup', (oldName, newName) => {
      const groupData = {
        from: oldName,
        to: newName,
        graph: id,
      };
      this.sendAll('renamegroup', groupData, context);
    });
    graph.on('changeGroup', (group) => {
      const groupData = {
        name: group.name,
        metadata: group.metadata,
        graph: id,
      };
      this.sendAll('changegroup', groupData, context);
    });
    graph.on('addInport', (publicName, port) => {
      const data = {
        public: publicName,
        node: port.process,
        port: port.port,
        metadata: port.metadata,
        graph: id,
      };
      this.sendAll('addinport', data, context);
    });
    graph.on('addOutport', (publicName, port) => {
      const data = {
        public: publicName,
        node: port.process,
        port: port.port,
        metadata: port.metadata,
        graph: id,
      };
      this.sendAll('addoutport', data, context);
    });
    graph.on('removeInport', (publicName) => {
      const data = {
        public: publicName,
        graph: id,
      };
      this.sendAll('removeinport', data, context);
    });
    graph.on('removeOutport', (publicName) => {
      const data = {
        public: publicName,
        graph: id,
      };
      this.sendAll('removeoutport', data, context);
    });
    graph.on('renameInport', (oldName, newName) => {
      const data = {
        from: oldName,
        to: newName,
        graph: id,
      };
      this.sendAll('renameinport', data, context);
    });
    graph.on('renameOutport', (oldName, newName) => {
      const data = {
        from: oldName,
        to: newName,
        graph: id,
      };
      this.sendAll('renameoutport', data, context);
    });
    return graph.on('endTransaction', () => this.emit('updated', {
      name: id,
      graph,
    }));
  }

  addNode(graph, node, context) {
    if (!node.id && !node.component) {
      this.send('error', new Error('No ID or component supplied'), context);
      return;
    }
    graph.addNode(node.id, node.component, node.metadata);
  }

  removeNode(graph, payload, context) {
    if (!payload.id) {
      this.send('error', new Error('No ID supplied'), context);
      return;
    }
    graph.removeNode(payload.id);
  }

  renameNode(graph, payload, context) {
    if (!payload.from && !payload.to) {
      this.send('error', new Error('No from or to supplied'), context);
      return;
    }
    graph.renameNode(payload.from, payload.to);
  }

  changeNode(graph, payload, context) {
    if (!payload.id && !payload.metadata) {
      this.send('error', new Error('No id or metadata supplied'), context);
      return;
    }
    graph.setNodeMetadata(payload.id, payload.metadata);
  }

  addEdge(graph, edge, context) {
    if (!edge.src && !edge.tgt) {
      this.send('error', new Error('No src or tgt supplied'), context);
      return;
    }
    if ((typeof edge.src.index === 'number') || (typeof edge.tgt.index === 'number')) {
      if (graph.addEdgeIndex) {
        graph.addEdgeIndex(
          edge.src.node,
          edge.src.port,
          edge.src.index,
          edge.tgt.node,
          edge.tgt.port,
          edge.tgt.index,
          edge.metadata,
        );
        return;
      }
    }
    graph.addEdge(edge.src.node, edge.src.port, edge.tgt.node, edge.tgt.port, edge.metadata);
  }

  removeEdge(graph, edge, context) {
    if (!edge.src && !edge.tgt) {
      this.send('error', new Error('No src or tgt supplied'), context);
      return;
    }
    graph.removeEdge(edge.src.node, edge.src.port, edge.tgt.node, edge.tgt.port);
  }

  changeEdge(graph, edge, context) {
    if (!edge.src && !edge.tgt) {
      this.send('error', new Error('No src or tgt supplied'), context);
      return;
    }
    graph.setEdgeMetadata(
      edge.src.node,
      edge.src.port,
      edge.tgt.node,
      edge.tgt.port,
      edge.metadata,
    );
  }

  addInitial(graph, payload, context) {
    if (!payload.src && !payload.tgt) {
      this.send('error', new Error('No src or tgt supplied'), context);
      return;
    }
    if (graph.addInitialIndex && (typeof payload.tgt.index === 'number')) {
      graph.addInitialIndex(
        payload.src.data,
        payload.tgt.node,
        payload.tgt.port,
        payload.tgt.index,
        payload.metadata,
      );
      return;
    }
    graph.addInitial(payload.src.data, payload.tgt.node, payload.tgt.port, payload.metadata);
  }

  removeInitial(graph, payload, context) {
    if (!payload.tgt) {
      this.send('error', new Error('No tgt supplied'), context);
      return;
    }
    graph.removeInitial(payload.tgt.node, payload.tgt.port);
  }

  addInport(graph, payload, context) {
    if (!payload.public && !payload.node && !payload.port) {
      this.send('error', new Error('Missing exported inport information'), context);
      return;
    }
    graph.addInport(payload.public, payload.node, payload.port, payload.metadata);
  }

  removeInport(graph, payload, context) {
    if (!payload.public) {
      this.send('error', new Error('Missing exported inport name'), context);
      return;
    }
    graph.removeInport(payload.public);
  }

  renameInport(graph, payload, context) {
    if (!payload.from && !payload.to) {
      this.send('error', new Error('No from or to supplied'), context);
      return;
    }
    graph.renameInport(payload.from, payload.to);
  }

  addOutport(graph, payload, context) {
    if (!payload.public && !payload.node && !payload.port) {
      this.send('error', new Error('Missing exported outport information'), context);
      return;
    }
    graph.addOutport(payload.public, payload.node, payload.port, payload.metadata);
  }

  removeOutport(graph, payload, context) {
    if (!payload.public) {
      this.send('error', new Error('Missing exported outport name'), context);
      return;
    }
    graph.removeOutport(payload.public);
  }

  renameOutport(graph, payload, context) {
    if (!payload.from && !payload.to) {
      this.send('error', new Error('No from or to supplied'), context);
      return;
    }
    graph.renameOutport(payload.from, payload.to);
  }

  addGroup(graph, payload, context) {
    if (!payload.name && !payload.nodes && !payload.metadata) {
      this.send('error', new Error('No name or nodes or metadata supplied'), context);
      return;
    }
    graph.addGroup(payload.name, payload.nodes, payload.metadata);
  }

  removeGroup(graph, payload, context) {
    if (!payload.name) {
      this.send('error', new Error('No name supplied'), context);
      return;
    }
    graph.removeGroup(payload.name);
  }

  renameGroup(graph, payload, context) {
    if (!payload.from && !payload.to) {
      this.send('error', new Error('No from or to supplied'), context);
      return;
    }
    graph.renameGroup(payload.from, payload.to);
  }

  changeGroup(graph, payload, context) {
    if (!payload.name && !payload.metadata) {
      this.send('error', new Error('No name or metadata supplied'), context);
      return;
    }
    graph.setEdgeMetadata(payload.name, payload.metadata);
  }
}

module.exports = GraphProtocol;
