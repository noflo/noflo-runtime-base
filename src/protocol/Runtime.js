/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const noflo = require('noflo');
const {
  EventEmitter
} = require('events');

const sendToInport = function(port, event, payload) {
  const socket = noflo.internalSocket.createSocket();
  port.attach(socket);
  switch (event) {
    case 'begingroup': socket.beginGroup(payload); break;
    case 'endgroup': socket.endGroup(payload); break;
    case 'data': socket.send(payload); break;
  }
  return port.detach(socket);
};

const findPort = function(network, name, inPort) {
  let internal;
  if (!network.graph) { return; }
  if (inPort) {
    internal = network.graph.inports[name];
  } else {
    internal = network.graph.outports[name];
  }
  if (!(internal != null ? internal.process : undefined)) { return; }
  const component = __guard__(network.getNode(internal.process), x => x.component);
  if (!component) { return; }
  if (inPort) { return component.inPorts[internal.port]; }
  return component.outPorts[internal.port];
};

const portToPayload = function(pub, internal, network, inPort) {
  const def = {
    id: pub,
    type: 'all',
    description: (internal.metadata != null ? internal.metadata.description : undefined),
    addressable: false,
    required: false
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
};

const portsPayload = function(name, network) {
  let internal, pub;
  const payload = {
    graph: name,
    inPorts: [],
    outPorts: []
  };
  if (!(network != null ? network.graph : undefined)) { return payload; }
  for (pub in network.graph.inports) {
    internal = network.graph.inports[pub];
    payload.inPorts.push(portToPayload(pub, internal, network, true));
  }
  for (pub in network.graph.outports) {
    internal = network.graph.outports[pub];
    payload.outPorts.push(portToPayload(pub, internal, network, false));
  }
  return payload;
};

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
        return this.subscribeOutdata(name, network, true);
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
        return this.sendPacket(payload, err => {
          if (err) {
            this.sendError(err.message, context);
            return;
          }
          this.send('packetsent', {
            port: payload.port,
            event: payload.event,
            graph: payload.graph,
            payload: payload.payload
          }
          , context);
        });
      default: return this.send('error', new Error(`runtime:${topic} not supported`), context);
    }
  }

  getRuntime(payload, context) {
    let {
      type
    } = this.transport.options;
    if (!type) {
      if (noflo.isBrowser()) {
        type = 'noflo-browser';
      } else {
        type = 'noflo-nodejs';
      }
    }

    const {
      capabilities
    } = this.transport.options;
    const permittedCapabilities = capabilities.filter(capability => {
      return this.transport.canDo(capability, payload.secret);
    });

    payload = {
      type,
      version: this.transport.version,
      capabilities: permittedCapabilities,
      allCapabilities: capabilities
    };
    if (this.mainGraph) { payload.graph = this.mainGraph; }

    // Add project metadata if available
    if (this.transport.options.id) { payload.id = this.transport.options.id; }
    if (this.transport.options.label) { payload.label = this.transport.options.label; }
    if (this.transport.options.namespace) { payload.namespace = this.transport.options.namespace; }
    if (this.transport.options.repository) { payload.repository = this.transport.options.repository; }
    if (this.transport.options.repositoryVersion) { payload.repositoryVersion = this.transport.options.repositoryVersion; }

    this.send('runtime', payload, context);
    // send port info about currently set up networks
    return (() => {
      const result = [];
      for (let name in this.transport.network.networks) {
        const network = this.transport.network.networks[name];
        result.push(this.sendPorts(name, network, context));
      }
      return result;
    })();
  }

  sendPorts(name, network, context) {
    const payload = portsPayload(name, network);
    this.emit('ports', payload);
    if (!context) {
      return this.sendAll('ports', payload);
    } else {
      return this.send('ports', payload, context);
    }
  }

  setMainGraph(id) {
    return this.mainGraph = id;
  }
    // XXX: should send updated runtime info?

  subscribeExportedPorts(name, network, add) {
    let d;
    const sendExportedPorts = () => {
      return this.sendPorts(name, network);
    };

    const dependencies = [
      'addInport',
      'addOutport',
      'removeInport',
      'removeOutport'
    ];
    for (d of Array.from(dependencies)) {
      network.graph.removeListener(d, sendExportedPorts);
    }

    if (add) {
      return (() => {
        const result = [];
        for (d of Array.from(dependencies)) {
          result.push(network.graph.on(d, sendExportedPorts));
        }
        return result;
      })();
    }
  }

  subscribeOutPorts(name, network, add) {
    const portRemoved = () => {
      return this.subscribeOutdata(name, network, false);
    };
    const portAdded = () => {
      return this.subscribeOutdata(name, network, true);
    };

    const {
      graph
    } = network;
    graph.removeListener('addOutport', portAdded);
    graph.removeListener('removeOutport', portRemoved);

    if (add) {
      graph.on('addOutport', portAdded);
      return graph.on('removeOutport', portRemoved);
    }
  }

  subscribeOutdata(graphName, network, add) {
    // Unsubscribe all
    let event, socket;
    if (!this.outputSockets[graphName]) { this.outputSockets[graphName] = {}; }
    let graphSockets = this.outputSockets[graphName];
    for (let pub in graphSockets) {
      socket = graphSockets[pub];
      for (event of Array.from(events)) {
        socket.removeAllListeners(event);
      }
    }
    graphSockets = {};

    if (!add) { return; }
    // Subscribe new
    return Object.keys(network.graph.outports).forEach(pub => {
      const internal = network.graph.outports[pub];
      socket = noflo.internalSocket.createSocket();
      graphSockets[pub] = socket;
      const {
        component
      } = network.processes[internal.process];
      if (!(component != null ? component.outPorts[internal.port] : undefined)) {
        throw new Error(`Exported outport ${internal.port} in node ${internal.process} not found`);
      }
      component.outPorts[internal.port].attach(socket);
      return socket.on('ip', ip => {
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
          payload: ip.data
        }
        );
        return this.sendAll('packet', {
          port: pub,
          event,
          graph: graphName,
          payload: ip.data
        }
        );
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

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}