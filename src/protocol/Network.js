const noflo = require('noflo');
const {
  EventEmitter,
} = require('events');

const prepareSocketEvent = function (event, graphName) {
  const payload = {
    id: event.id,
    graph: graphName,
  };
  if (event.socket.from) {
    payload.src = {
      node: event.socket.from.process.id,
      port: event.socket.from.port,
    };
  }
  if (event.socket.to) {
    payload.tgt = {
      node: event.socket.to.process.id,
      port: event.socket.to.port,
    };
  }
  if (event.subgraph) {
    payload.subgraph = event.subgraph;
  }
  if (typeof event.group !== 'undefined') {
    payload.group = event.group;
  }
  if (event.datatype) {
    payload.type = event.datatype;
  }
  if (event.schema) {
    payload.schema = event.schema;
  }
  payload.data = event.data;
  if (typeof payload.data !== 'undefined') {
    if (!noflo.isBrowser()) {
      if (Buffer.isBuffer(payload.data)) {
        // Make sure we're not trying to serialize the whole buffer to JSON
        payload.data = payload.data.slice(0, 20);
      }
    }
    if (payload.data != null ? payload.data.toJSON : undefined) {
      payload.data = payload.data.toJSON();
    }
    if (payload.data != null ? payload.data.toString : undefined) {
      payload.data = payload.data.toString();
      if (payload.data === '[object Object]') {
        try {
          payload.data = JSON.parse(JSON.stringify(payload.data));
        } catch (error) {
          // Ignored
        }
      }
    }

    if (event.metadata != null ? event.metadata.secure : undefined) {
      // Don't send actual payload for private connections
      payload.data = 'DATA';
    }
  }

  return payload;
};

const getPortSignature = (item) => {
  if (!item) { return ''; }
  return `${item.process}(${item.port})`;
};

const getEdgeSignature = (edge) => `${getPortSignature(edge.src)} -> ${getPortSignature(edge.tgt)}`;

const getConnectionSignature = (connection) => {
  if (!connection) { return ''; }
  return `${connection.process.id}(${connection.port})`;
};

const getSocketSignature = (socket) => `${getConnectionSignature(socket.from)} -> ${getConnectionSignature(socket.to)}`;

class NetworkProtocol extends EventEmitter {
  constructor(transport) {
    super();
    this.transport = transport;
    this.networks = {};
  }

  send(topic, payload, context) {
    return this.transport.send('network', topic, payload, context);
  }

  sendAll(topic, payload) {
    return this.transport.sendAll('network', topic, payload);
  }

  receive(topic, payload, context) {
    const graph = this.resolveGraph(payload, context);
    if (!graph) { return; }
    switch (topic) {
      case 'start':
        this.startNetwork(graph, payload, context); break;
      case 'stop':
        this.stopNetwork(graph, payload, context); break;
      case 'edges':
        this.updateEdgesFilter(graph, payload, context); break;
      case 'debug':
        this.debugNetwork(graph, payload, context); break;
      case 'getstatus':
        this.getStatus(graph, payload, context); break;
      default: this.send('error', new Error(`network:${topic} not supported`), context);
    }
  }

  resolveGraph(payload, context) {
    if (!payload.graph) {
      this.send('error', new Error('No graph specified'), context);
      return null;
    }
    if (!this.transport.graph.graphs[payload.graph]) {
      this.send('error', new Error('Requested graph not found'), context);
      return null;
    }
    return this.transport.graph.graphs[payload.graph];
  }

  updateEdgesFilter(graph, payload, context) {
    let network = this.networks[payload.graph];
    if (network) {
      network.filters = {};
    } else {
      network = {
        network: null,
        filters: {},
      };
      this.networks[payload.graph] = network;
    }

    payload.edges.forEach((edge) => {
      const signature = getEdgeSignature(edge);
      network.filters[signature] = true;
    });
    this.send('edges', {
      graph: payload.graph,
      edges: payload.edges,
    },
    context);
  }

  eventFiltered(graph, event) {
    if (!this.transport.options.filterData) { return true; }
    const sign = getSocketSignature(event.socket);
    return this.networks[graph].filters[sign];
  }

  initNetwork(graph, graphName, context, callback) {
    // Ensure we stop previous network
    if (this.networks[graphName] && this.networks[graphName].network) {
      const {
        network,
      } = this.networks[graphName];
      network.stop((err) => {
        if (err) { return callback(err); }
        delete this.networks[graphName];
        this.emit('removenetwork', network, graphName, this.networks);
        return this.initNetwork(graph, graphName, context, callback);
      });
      return;
    }

    const g = graph;
    g.componentLoader = this.transport.component.getLoader(graph.baseDir, this.transport.options);
    const opts = JSON.parse(JSON.stringify(this.transport.options));
    opts.delay = true;
    noflo.createNetwork(g, (err, network) => {
      if (err) { return callback(err); }
      if (this.networks[graphName] && this.networks[graphName].network) {
        this.networks[graphName].network = network;
      } else {
        this.networks[graphName] = {
          network,
          filters: {},
        };
      }
      this.emit('addnetwork', network, graphName, this.networks);
      this.subscribeNetwork(network, graphName, context);

      // Run the network
      return network.connect(callback);
    },
    opts);
  }

  subscribeNetwork(network, graphName, context) {
    network.on('start', (event) => this.sendAll('started', {
      time: event.start,
      graph: graphName,
      running: network.isRunning(),
      started: network.isStarted(),
    },
    context));
    network.on('end', (event) => this.sendAll('stopped', {
      time: new Date(),
      uptime: event.uptime,
      graph: graphName,
      running: network.isRunning(),
      started: network.isStarted(),
    },
    context));
    network.on('icon', (event) => {
      this.sendAll('icon', {
        ...event,
        graph: graphName,
      }, context);
    });
    network.on('ip', (event) => {
      if (!this.eventFiltered(graphName, event)) { return; }
      const protocolEvent = {
        id: event.id,
        socket: event.socket,
        subgraph: event.subgraph,
        metadata: event.metadata,
      };
      switch (event.type) {
        case 'openBracket': {
          protocolEvent.type = 'begingroup';
          protocolEvent.group = event.data || '';
          break;
        }
        case 'data': {
          protocolEvent.type = 'data';
          protocolEvent.data = event.data;
          protocolEvent.datatype = event.datatype;
          protocolEvent.schema = event.schema;
          break;
        }
        case 'closeBracket': {
          protocolEvent.type = 'endgroup';
          protocolEvent.group = event.data || '';
          break;
        }
        default: {
          // Ignored for now
        }
      }
      this.sendAll(protocolEvent.type, prepareSocketEvent(protocolEvent, graphName), context);
    });
    return network.on('process-error', (event) => {
      let error = event.error.message;
      // If we can get a backtrace, send 3 levels
      if (event.error.stack) {
        const bt = event.error.stack.split('\n');
        for (let i = 0, end = Math.min(bt.length, 3), asc = end >= 0; asc ? i <= end : i >= end; asc ? i++ : i--) {
          error += `\n${bt[i]}`;
        }
      }
      this.sendAll('processerror', {
        id: event.id,
        error,
        graph: graphName,
      },
      context);
    });
  }

  _startNetwork(graph, graphName, context, callback) {
    const doStart = (net) => net.start((err) => callback(err));

    let network = this.networks[graphName];
    if (network && network.network) {
      // already initialized
      return doStart(network.network);
    }

    return this.initNetwork(graph, graphName, context, (err) => {
      if (err) { return callback(err); }
      network = this.networks[graphName];
      return doStart(network.network);
    });
  }

  startNetwork(graph, payload, context) {
    this._startNetwork(graph, payload.graph, context, (err) => {
      if (err) { this.send('error', err, context); }
    });
  }

  stopNetwork(graph, payload, context) {
    if (!this.networks[payload.graph]) {
      this.send('error', new Error(`Network ${payload.graph} not found`), context);
      return;
    }
    const net = this.networks[payload.graph].network;
    if (!net) {
      this.send('error', new Error(`Network ${payload.graph} not found`), context);
      return;
    }
    if (net.isStarted()) {
      this.networks[payload.graph].network.stop((err) => {
        if (err) {
          this.send('error', err, context);
          return;
        }
        this.send('stopped', {
          time: new Date(),
          graph: payload.graph,
          running: net.isRunning(),
          started: net.isStarted(),
        },
        context);
      });
      return;
    }
    // Was already stopped, just send the confirmation
    this.send('stopped', {
      time: new Date(),
      graph: payload.graph,
      running: net.isRunning(),
      started: net.isStarted(),
    },
    context);
  }

  debugNetwork(graph, payload, context) {
    if (!this.networks[payload.graph]) {
      this.send('error', new Error(`Network ${payload.graph} not found`), context);
      return;
    }
    const net = this.networks[payload.graph].network;
    if (!net) {
      this.send('error', new Error(`Network ${payload.graph} not found`), context);
      return;
    }
    net.setDebug(payload.enable);
    this.send('setdebug',
      { enable: payload.enable });
  }

  getStatus(graph, payload, context) {
    if (!this.networks[payload.graph]) {
      this.send('error', new Error(`Network ${payload.graph} not found`), context);
      return;
    }
    const net = this.networks[payload.graph].network;
    if (!net) {
      this.send('error', new Error(`Network ${payload.graph} not found`), context);
      return;
    }
    this.send('status', {
      graph: payload.graph,
      running: net.isRunning(),
      started: net.isStarted(),
    },
    context);
  }
}

module.exports = NetworkProtocol;
