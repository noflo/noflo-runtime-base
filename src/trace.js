/* eslint class-methods-use-this: ["error", { "exceptMethods": ["detach"] }] */
const noflo = require('noflo');
const debug = require('debug')('noflo-runtime-base:trace');
const TraceBuffer = require('./TraceBuffer');

let jsonStringify = JSON.stringify;
try {
  // eslint-disable-next-line global-require
  jsonStringify = require('json-stringify-safe');
} catch (error) {
  debug(`WARN: failed to load json-stringify-safe, circular objects may cause fail.\n${error.message}`);
}

function clone(obj) {
  const s = jsonStringify(obj);
  return JSON.parse(s);
}

function subscribeExportedOutports(network, networkId, eventNames, subscribeFunc) {
  const graphSockets = {};

  // Basically same as code in runtime:data protocol handling
  Object.keys(network.graph.outports).forEach((pub) => {
    const internal = network.graph.outports[pub];
    const socket = noflo.internalSocket.createSocket();
    graphSockets[pub] = socket;
    const {
      component,
    } = network.processes[internal.process];
    component.outPorts[internal.port].attach(socket);
    const sendFunc = (event) => (function (payload) {
      const data = {
        id: `EXPORT: ${networkId} ${pub.toUpperCase()} ->`, // just for debugging
        payload,
        socket: {
          to: {
            process: { id: networkId },
            port: pub,
          },
        },
      };
      return subscribeFunc(event, data);
    });

    eventNames.forEach((event) => {
      socket.on(event, sendFunc(event));
    });
  });
  return graphSockets;
}

// Convert to flowtrace/FBP-protocol format http://noflojs.org/documentation/protocol/
function networkToTraceEvent(networkId, type, data) {
  debug('event', networkId, type, `'${data.id}'`);
  const {
    socket,
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
        port: (socket.from != null ? socket.from.port : undefined),
      },
      tgt: {
        node: (socket.to != null ? socket.to.process.id : undefined),
        port: (socket.to != null ? socket.to.port : undefined),
      },
      id: undefined, // deprecated
      subgraph: undefined,
    }, // TODO: implement
  };

  const serializeGroup = function (p) {
    const serialized = p;
    try {
      serialized.group = data.group.toString();
    } catch (e) {
      debug('group serialization error', e);
      serialized.error = e.message;
    }
  };

  const p = event.payload;
  switch (type) {
    case 'connect': break;
    case 'disconnect': break;
    case 'begingroup': serializeGroup(event.payload); break;
    case 'endgroup': serializeGroup(event.payload); break;
    case 'data':
      try {
        p.data = clone(data.data);
      } catch (error1) {
        debug('data serialization error', error1);
        p.error = error1.message;
      }
      break;
    default:
      throw new Error(`trace: Unknown event type ${type}`);
  }

  debug('event done', networkId, type, `'${data.id}'`);
  return event;
}

// Can be attached() to a NoFlo network, and keeps a circular buffer of events
// which can be persisted on request
class Tracer {
  constructor(options) {
    this.options = options;
    this.buffer = new TraceBuffer();
    this.header = { graphs: {} };
  }

  attach(network) {
    // FIXME: graphs loaded from .fbp don't have name.
    // Should default to basename of file, and be configurable
    const netId = network.graph.name || network.graph.properties.name || 'default';
    debug('attach', netId);
    const eventNames = [
      'connect',
      'begingroup',
      'data',
      'endgroup',
      'disconnect',
    ];
    // internal network events
    eventNames.forEach((event) => network.on(event, (data) => {
      const payload = networkToTraceEvent(netId, event, data);
      return this.buffer.add(payload);
    }));
    // exported outport
    subscribeExportedOutports(network, netId, eventNames, (event, data) => {
      const payload = networkToTraceEvent(netId, event, data);
      return this.buffer.add(payload);
    });

    this.header.graphs[netId] = network.graph.toJSON();
  }

  detach() {
    // TODO: implement
  }

  // Serialize current content of buffer
  dumpString(callback) {
    const events = [];
    const consume = (e) => events.push(e);
    return this.buffer.getAll(consume, (err) => {
      const trace = {
        header: this.header,
        events,
      };
      return callback(err, JSON.stringify(trace, null, 2));
    });
  }

  // node.js only
  dumpFile(filepath, callback) {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    // eslint-disable-next-line global-require
    const temp = require('temp');

    let openFile = (cb) => fs.open(filepath, 'w', (err, fd) => cb(err, { path: filepath, fd }));
    if (!filepath) {
      openFile = (cb) => temp.open({ suffix: '.json' }, cb);
    }

    return openFile((err, info) => {
      if (err) {
        callback(err);
        return;
      }

      // HACKY json streaming serialization
      let events = 0;
      const write = (data, cb) => fs.write(info.fd, data, { encoding: 'utf-8' }, cb);
      const writeEvent = function (e) {
        let s = events ? ',' : '';
        events += 1;
        s += JSON.stringify(e, null, 2);
        write(s, () => {});
      };
      // FIXME: handle, wait

      debug('streaming to file', info.path);
      const header = JSON.stringify(this.header, null, 2);
      write(`{\n "header": ${header}\n, "events":\n[`, (err1) => {
        if (err1) {
          callback(err1);
          return;
        }
        this.buffer.getAll(writeEvent, (err2) => {
          if (err2) {
            callback(err2);
            return;
          }
          debug(`streamed ${events} events`);
          write(']\n }', (err3) => {
            debug('completed stream', info.path);
            callback(err3, info.path);
          });
        });
      });
    });
  }
}

module.exports.Tracer = Tracer;
