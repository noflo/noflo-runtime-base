const noflo = require('noflo');
const {
  EventEmitter,
} = require('events');

function sendToInport(port, event, payload) {
  const socket = noflo.internalSocket.createSocket();
  port.attach(socket);
  switch (event) {
    case 'begingroup': socket.beginGroup(payload); break;
    case 'endgroup': socket.endGroup(payload); break;
    case 'data': socket.send(payload); break;
    default: {
      // Ignored
    }
  }
  port.detach(socket);
}

function findPort(network, name, inPort) {
  let internal;
  if (!network.graph) { return null; }
  if (inPort) {
    internal = network.graph.inports[name];
  } else {
    internal = network.graph.outports[name];
  }
  if (!(internal != null ? internal.process : undefined)) { return null; }
  const node = network.getNode(internal.process);
  if (!node) {
    return null;
  }
  const component = node.component;
  if (!component) {
    return null;
  }
  if (inPort) {
    return component.inPorts.ports[internal.port];
  }
  return component.outPorts.ports[internal.port];
}

function portToPayload(pub, internal, network, inPort) {
  const def = {
    id: pub,
    type: 'all',
    description: (internal.metadata != null ? internal.metadata.description : undefined),
    addressable: false,
    required: false,
  };
  const port = findPort(network, pub, inPort);
  // Network has been prepared but isn't running yet so
  // we don't have full component info
  if (!port) { return def; }
  def.type = port.getDataType() || 'all';
  if (typeof port.getSchema === 'function' ? port.getSchema() : undefined) { def.schema = port.getSchema(); }
  def.description = (internal.metadata != null ? internal.metadata.description : undefined) || port.getDescription() || '';
  def.addressable = port.isAddressable();
  def.required = port.isRequired();
  return def;
}

function portsPayload(name, network) {
  let internal;
  const payload = {
    graph: name,
    inPorts: [],
    outPorts: [],
  };
  if (!(network != null ? network.graph : undefined)) { return payload; }
  Object.keys(network.graph.inports).forEach((pub) => {
    internal = network.graph.inports[pub];
    payload.inPorts.push(portToPayload(pub, internal, network, true));
  });
  Object.keys(network.graph.outports).forEach((pub) => {
    internal = network.graph.outports[pub];
    payload.outPorts.push(portToPayload(pub, internal, network, false));
  });
  return payload;
}

class RuntimeProtocol extends EventEmitter {
  constructor(transport) {
    super();
    this.transport = transport;
    this.outputSockets = {}; // graphName -> publicPort -> noflo.Socket
    this.mainGraph = null;

    this.transport.network.on('addnetwork', (network, name) => {
      this.subscribeExportedPorts(name, network, true);
      this.subscribeOutPorts(name, network);
      this.sendPorts(name, network);

      if (network.isStarted()) {
        // processes don't exist until started
        this.subscribeOutdata(name, network, true);
      }
      return network.on('start', () => {
        // processes don't exist until started
        this.subscribeOutdata(name, network, true);
      });
    });

    this.transport.network.on('removenetwork', (network, name) => {
      this.subscribeOutdata(name, network, false);
      this.subscribeOutPorts(name, network);
      this.subscribeExportedPorts(name, network.graph, false);
      return this.sendPorts(name, null);
    });
  }

  send(topic, payload, context) {
    return this.transport.send('runtime', topic, payload, context);
  }

  sendAll(topic, payload) {
    return this.transport.sendAll('runtime', topic, payload);
  }

  sendError(message, context) {
    return this.send('error', new Error(message), context);
  }

  receive(topic, payload, context) {
    switch (topic) {
      case 'getruntime': return this.getRuntime(payload, context);
      case 'packet':
        return this.sendPacket(payload, (err) => {
          if (err) {
            this.sendError(err.message, context);
            return;
          }
          this.send('packetsent', {
            port: payload.port,
            event: payload.event,
            graph: payload.graph,
            payload: payload.payload,
          },
          context);
        });
      default: return this.send('error', new Error(`runtime:${topic} not supported`), context);
    }
  }

  getRuntime(request, context) {
    let {
      type,
    } = this.transport.options;
    if (!type) {
      if (noflo.isBrowser()) {
        type = 'noflo-browser';
      } else {
        type = 'noflo-nodejs';
      }
    }

    const {
      capabilities,
    } = this.transport.options;
    const secret = request ? request.secret : null;
    const permittedCapabilities = capabilities.filter(
      (capability) => this.transport.canDo(capability, secret),
    );

    const payload = {
      type,
      version: this.transport.version,
      capabilities: permittedCapabilities,
      allCapabilities: capabilities,
    };
    if (this.mainGraph) {
      payload.graph = this.mainGraph;
    }

    // Add project metadata if available
    if (this.transport.options.id) { payload.id = this.transport.options.id; }
    if (this.transport.options.label) { payload.label = this.transport.options.label; }
    if (this.transport.options.namespace) { payload.namespace = this.transport.options.namespace; }
    if (this.transport.options.repository) {
      payload.repository = this.transport.options.repository;
    }
    if (this.transport.options.repositoryVersion) {
      payload.repositoryVersion = this.transport.options.repositoryVersion;
    }

    this.send('runtime', payload, context);
    // send port info about currently set up networks
    return (() => {
      const result = [];
      Object.keys(this.transport.network.networks).forEach((name) => {
        const network = this.transport.network.networks[name];
        result.push(this.sendPorts(name, network, context));
      });
      return result;
    })();
  }

  sendPorts(name, network, context) {
    const payload = portsPayload(name, network);
    this.emit('ports', payload);
    if (!context) {
      return this.sendAll('ports', payload);
    }
    return this.send('ports', payload, context);
  }

  setMainGraph(id) {
    this.mainGraph = id;
  }
  // XXX: should send updated runtime info?

  subscribeExportedPorts(name, network, add) {
    const sendExportedPorts = () => this.sendPorts(name, network);
    const dependencies = [
      'addInport',
      'addOutport',
      'removeInport',
      'removeOutport',
    ];
    dependencies.forEach((d) => {
      network.graph.removeListener(d, sendExportedPorts);
    });

    if (add) {
      const result = [];
      dependencies.forEach((d) => {
        result.push(network.graph.on(d, sendExportedPorts));
      });
    }
  }

  subscribeOutPorts(name, network, add) {
    const portRemoved = () => this.subscribeOutdata(name, network, false);
    const portAdded = () => this.subscribeOutdata(name, network, true);

    const {
      graph,
    } = network;
    graph.removeListener('addOutport', portAdded);
    graph.removeListener('removeOutport', portRemoved);

    if (add) {
      graph.on('addOutport', portAdded);
      graph.on('removeOutport', portRemoved);
    }
  }

  subscribeOutdata(graphName, network, add) {
    // Unsubscribe all
    if (!this.outputSockets[graphName]) { this.outputSockets[graphName] = {}; }
    let graphSockets = this.outputSockets[graphName];
    Object.keys(graphSockets).forEach((pub) => {
      const socket = graphSockets[pub];
      socket.removeAllListeners('ip');
    });
    graphSockets = {};

    if (!add) { return; }
    // Subscribe new
    Object.keys(network.graph.outports).forEach((pub) => {
      const internal = network.graph.outports[pub];
      const socket = noflo.internalSocket.createSocket();
      graphSockets[pub] = socket;
      const {
        component,
      } = network.processes[internal.process];
      if (!(component != null ? component.outPorts[internal.port] : undefined)) {
        throw new Error(`Exported outport ${internal.port} in node ${internal.process} not found`);
      }
      component.outPorts[internal.port].attach(socket);
      let event;
      socket.on('ip', (ip) => {
        switch (ip.type) {
          case 'openBracket':
            event = 'begingroup';
            break;
          case 'closeBracket':
            event = 'endgroup';
            break;
          default:
            event = ip.type;
        }
        this.emit('packet', {
          port: pub,
          event,
          graph: graphName,
          payload: ip.data,
        });
        this.sendAll('packet', {
          port: pub,
          event,
          graph: graphName,
          payload: ip.data,
        });
      });
    });
  }

  sendPacket(payload, callback) {
    const network = this.transport.network.networks[payload.graph];
    if (!network) { return callback(new Error(`Cannot find network for graph ${payload.graph}`)); }
    const port = findPort(network.network, payload.port, true);
    if (!port) { return callback(new Error(`Cannot find internal port for ${payload.port}`)); }
    sendToInport(port, payload.event, payload.payload);
    return callback();
  }
}

module.exports = RuntimeProtocol;
