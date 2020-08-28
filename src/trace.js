/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

let e;
const noflo = require('noflo');
const debug = require('debug')('noflo-runtime-base:trace');
let jsonStringify = JSON.stringify;
try {
  jsonStringify = require('json-stringify-safe');
} catch (error) {
  e = error;
  console.log(`WARN: failed to load json-stringify-safe, circular objects may cause fail.\n${e.message}`);
}

const clone = function(obj) {
  const s = jsonStringify(obj);
  return JSON.parse(s);
};


class TraceBuffer {
  constructor() {
    this.events = []; // PERF: use a linked-list variety instead
  }

  add(event) {
    // FIXME: respect a (configurable) limit on size https://github.com/noflo/noflo-runtime-base/issues/34
    return this.events.push(event);
  }

  getAll(consumeFunc, doneFunc) {
    for (e of Array.from(this.events)) {
      consumeFunc(e);
    }
    return doneFunc(null);
  }
}

const subscribeExportedOutports = function(network, networkId, eventNames, subscribeFunc) {
  const graphSockets = {};

  // Basically same as code in runtime:data protocol handling
  for (var pub in network.graph.outports) {
    const internal = network.graph.outports[pub];
    const socket = noflo.internalSocket.createSocket();
    graphSockets[pub] = socket;
    const {
      component
    } = network.processes[internal.process];
    component.outPorts[internal.port].attach(socket);
    const sendFunc = event => (function(payload) {
      const data = {
        id: `EXPORT: ${networkId} ${pub.toUpperCase()} ->`, // just for debugging
        payload,
        socket: {
          to: {
            process: { id: networkId },
            port: pub
          }
        }
      };
      return subscribeFunc(event, data);
    });

    for (let event of Array.from(eventNames)) {
      socket.on(event, sendFunc(event));
    }
  }
  return graphSockets;
};

// Convert to flowtrace/FBP-protocol format http://noflojs.org/documentation/protocol/
const networkToTraceEvent = function(networkId, type, data) {

  debug('event', networkId, type, `'${data.id}'`);
  const {
    socket
  } = data;

  // XXX: wasteful to have the network thing in each event?
  const event = {
    protocol: 'network',
    command: type,
    payload: {
      time: new Date().toISOString(),
      graph: networkId,
      error: null, // used to indicate tracing errors
      src: {
        node: (socket.from != null ? socket.from.process.id : undefined),
        port: (socket.from != null ? socket.from.port : undefined)
      },
      tgt: {
        node: (socket.to != null ? socket.to.process.id : undefined),
        port: (socket.to != null ? socket.to.port : undefined)
      },
      id: undefined, // deprecated
      subgraph: undefined
    } // TODO: implement
  };

  const serializeGroup = function(p) {
    try {
      return p.group = data.group.toString();
    } catch (e) {
      debug('group serialization error', e);
      return p.error = e.message;
    }
  };

  const p = event.payload;
  switch (type) {
    case 'connect': null; break;
    case 'disconnect': null; break;
    case 'begingroup': serializeGroup(event.payload); break;
    case 'endgroup': serializeGroup(event.payload); break;
    case 'data':
      try {
        p.data = clone(data.data);
      } catch (error1) {
        e = error1;
        debug('data serialization error', e);
        p.error = e.message;
      }
      break;
    default:
      throw new Error(`trace: Unknown event type ${type}`);
  }

  debug('event done', networkId, type, `'${data.id}'`);
  return event;
};

// Can be attached() to a NoFlo network, and keeps a circular buffer of events
// which can be persisted on request
class Tracer {
  constructor(options) {
    this.options = options;
    this.buffer = new TraceBuffer;
    this.header =
      {graphs: {}};
  }

  attach(network) {
    // FIXME: graphs loaded from .fbp don't have name. Should default to basename of file, and be configurable
    const netId = network.graph.name || network.graph.properties.name || 'default';
    debug('attach', netId);
    const eventNames = [
      'connect',
      'begingroup',
      'data',
      'endgroup',
      'disconnect'
    ];
    // internal network events
    eventNames.forEach(event => {
      return network.on(event, data => {
        const payload = networkToTraceEvent(netId, event, data);
        return this.buffer.add(payload);
      });
    });
    // exported outport
    const sockets = subscribeExportedOutports(network, netId, eventNames, (event, data) => {
      const payload = networkToTraceEvent(netId, event, data);
      return this.buffer.add(payload);
    });

    return this.header.graphs[netId] = network.graph.toJSON();
  }

  detach(network) {
    // TODO: implement
  }

  // Serialize current content of buffer
  dumpString(callback) {
    const events = [];
    const consume = e => events.push(e);
    return this.buffer.getAll(consume, err => {
      const trace = {
        header: this.header,
        events
      };
      return callback(err, JSON.stringify(trace, null, 2));
    });
  }

  // node.js only
  dumpFile(filepath, callback) {
    const fs = require('fs');
    const temp = require('temp');

    let openFile = cb => fs.open(filepath, 'w', (err, fd) => cb(err, { path: filepath, fd }));
    if (!filepath) {
      openFile = cb => temp.open({ suffix: '.json' }, cb);
    }

    return openFile((err, info) => {
      if (err) { return callback(err); }

      // HACKY json streaming serialization
      let events = 0;
      const write = (data, cb) => fs.write(info.fd, data, { encoding: 'utf-8' }, cb);
      const writeEvent = function(e) {
        let s = events ? ',' : '';
        events += 1;
        s += JSON.stringify(e, null, 2);
        return write(s, function(err) {});
      };
          // FIXME: handle, wait

      debug('streaming to file', info.path);
      const header = JSON.stringify(this.header, null, 2);
      return write(`{\n \"header\": ${header}\n, \"events\":\n[`, err => {
        return this.buffer.getAll(writeEvent, function(err) {
          if (err) { return callback(err); }
          debug(`streamed ${events} events`);
          return write(']\n }', function(err) {
            debug("completed stream", info.path);
            return callback(err, info.path);
          });
        });
      });
    });
  }
}


module.exports.Tracer = Tracer;
