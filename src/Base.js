const {
  EventEmitter,
} = require('events');

/* eslint class-methods-use-this: ["error", { "exceptMethods": ["send", "sendAll"] }] */
const protocols = {
  // eslint-disable-next-line global-require
  Runtime: require('./protocol/Runtime'),
  // eslint-disable-next-line global-require
  Graph: require('./protocol/Graph'),
  // eslint-disable-next-line global-require
  Network: require('./protocol/Network'),
  // eslint-disable-next-line global-require
  Component: require('./protocol/Component'),
};

const debugMessagingReceive = require('debug')('noflo-runtime-base:messaging:receive');
const debugMessagingReceivePayload = require('debug')('noflo-runtime-base:messaging:receive:payload');
const debugMessagingSend = require('debug')('noflo-runtime-base:messaging:send');
const debugMessagingSendPayload = require('debug')('noflo-runtime-base:messaging:send:payload');

const { withNamespace } = require('./utils');

// This is the class all NoFlo runtime implementations can extend to easily wrap
// into any transport protocol.
class BaseTransport extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    if (!this.options) { this.options = {}; }
    this.version = '0.7';
    this.component = new protocols.Component(this);
    this.graph = new protocols.Graph(this);
    this.network = new protocols.Network(this);
    this.runtime = new protocols.Runtime(this);
    this.context = null;

    if ((this.options.captureOutput != null) && this.options.captureOutput) {
      // Start capturing so that we can send it to the UI when it connects
      this.startCapture();
    }

    if (!this.options.capabilities) {
      this.options.capabilities = [
        'protocol:graph',
        'protocol:component',
        'protocol:network',
        'protocol:runtime',
        'component:setsource',
        'component:getsource',
        'graph:readonly',
        'network:data',
        'network:control',
        'network:status',
      ];
    }

    if (!this.options.defaultPermissions) {
      // Default: no capabilities granted for anonymous users
      this.options.defaultPermissions = [];
    }

    if (!this.options.permissions) {
      this.options.permissions = {};
    }

    setTimeout(() => {
      this._startDefaultGraph();
    }, 0);
  }

  // Generate a name for the main graph
  getGraphName(graph) {
    const namespace = this.options.namespace || 'default';
    const graphName = graph.name || 'main';
    return withNamespace(graphName, namespace);
  }

  _startDefaultGraph() {
    if (!this.options.defaultGraph) {
      this.emit('ready', null);
      return;
    }
    this.options.defaultGraph.baseDir = this.options.baseDir;
    const graphName = this.getGraphName(this.options.defaultGraph);
    this.context = 'none';
    this.network._startNetwork(
      this.options.defaultGraph,
      graphName,
      this.context,
      (err, network) => {
        if (err) {
          this.emit('error', err);
          return;
        }
        this.graph.registerGraph(graphName, this.options.defaultGraph, false);
        this.runtime.setMainGraph(graphName, this.options.defaultGraph);
        this.emit('ready', network);
      },
    );
  }

  // Check if a given user is authorized for a given capability
  //
  // @param [Array] Capabilities to check
  // @param [String] Secret provided by user
  canDo(capability, secret) {
    let checkCapabilities;
    if (typeof capability === 'string') {
      checkCapabilities = [capability];
    } else {
      checkCapabilities = capability;
    }
    const userCapabilities = this.getPermitted(secret);
    const permitted = checkCapabilities.filter((perm) => userCapabilities.includes(perm));
    if (permitted.length > 0) {
      return true;
    }
    return false;
  }

  // Check if a given user is authorized to send a given message
  canInput(protocol, topic, secret) {
    if (protocol === 'graph') {
      // All graph messages are under the same capability
      return this.canDo(['protocol:graph'], secret);
    }
    const message = `${protocol}:${topic}`;
    switch (message) {
      case 'component:list': return this.canDo(['protocol:component'], secret);
      case 'component:getsource': return this.canDo(['component:getsource'], secret);
      case 'component:source': return this.canDo(['component:setsource'], secret);
      case 'network:edges': return this.canDo(['network:data', 'protocol:network'], secret);
      case 'network:start': return this.canDo(['network:control', 'protocol:network'], secret);
      case 'network:stop': return this.canDo(['network:control', 'protocol:network'], secret);
      case 'network:debug': return this.canDo(['network:control', 'protocol:network'], secret);
      case 'network:getstatus': return this.canDo(['network:status', 'network:control', 'protocol:network'], secret);
      case 'runtime:getruntime': return true;
      case 'runtime:packet': return this.canDo(['protocol:runtime'], secret);
      default: return false;
    }
  }

  // Get enabled capabilities for a user
  //
  // @param [String] Secret provided by user
  getPermitted(secret) {
    if (!secret) {
      return this.options.defaultPermissions;
    }
    if (!this.options.permissions[secret]) {
      return [];
    }
    return this.options.permissions[secret];
  }

  // Send a message back to the user via the transport protocol.
  //
  // Each transport implementation should provide their own implementation
  // of this method.
  //
  // The context is usually the context originally received from the
  // transport with the request. This could be an iframe origin or a
  // specific WebSocket connection.
  //
  // @param [String] Name of the protocol
  // @param [String] Topic of the message
  // @param [Object] Message payload
  // @param [Object] Message context, dependent on the transport
  send(protocol, topic, payload) {
    debugMessagingSend(`${protocol} ${topic}`);
    return debugMessagingSendPayload(payload);
  }

  // Send a message to *all users*  via the transport protocol
  //
  // The transport should verify that the recipients are authorized to receive
  // the message by using the `canDo` method.
  //
  // Like send() only it sends to all.
  //
  // @param [String] Name of the protocol
  // @param [String] Topic of the message
  // @param [Object] Message payload
  // @param [Object] Message context, dependent on the transport
  sendAll() {}

  // This is the entry-point to actual protocol handlers. When receiving
  // a message, the runtime should call this to make the requested actions
  // happen
  //
  // The context is originally received from the transport. This could be
  // an iframe origin or a specific WebSocket connection. The context will
  // be utilized when sending messages back to the requester.
  //
  // @param [String] Name of the protocol
  // @param [String] Topic of the message
  // @param [Object] Message payload
  // @param [Object] Message context, dependent on the transport
  receive(protocol, topic, payload = {}, context) {
    debugMessagingReceive(`${protocol} ${topic}`);
    debugMessagingReceivePayload(payload);

    const secret = payload ? payload.secret : null;
    if (!this.canInput(protocol, topic, secret)) {
      this.send(protocol, 'error', new Error(`${protocol}:${topic} is not permitted`), context);
      return;
    }

    this.context = context;
    switch (protocol) {
      case 'runtime': {
        this.runtime.receive(topic, payload, context);
        return;
      }
      case 'graph': {
        this.graph.receive(topic, payload, context);
        return;
      }
      case 'network': {
        this.network.receive(topic, payload, context);
        return;
      }
      case 'component': {
        this.component.receive(topic, payload, context);
        return;
      }
      default: {
        this.send(protocol, 'error', new Error(`Protocol ${protocol} is not supported`), context);
      }
    }
  }
}

module.exports = BaseTransport;
module.exports.trace = require('./trace');
module.exports.direct = require('./direct');
