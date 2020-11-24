const { Flowtrace } = require('flowtrace');

class TraceProtocol {
  constructor(transport) {
    this.transport = transport;
    this.traces = {};
  }

  send(topic, payload, context) {
    return this.transport.send('trace', topic, payload, context);
  }

  sendAll(topic, payload) {
    return this.transport.sendAll('trace', topic, payload);
  }

  receive(topic, payload, context) {
    switch (topic) {
      case 'start': {
        this.start(payload, context);
        break;
      }
      case 'stop': {
        this.stop(payload, context);
        break;
      }
      case 'dump': {
        this.dump(payload, context);
        break;
      }
      case 'clear': {
        this.clear(payload, context);
        break;
      }
      default: {
        this.send('error', new Error(`trace:${topic} not supported`), context);
      }
    }
  }

  resolveGraph(payload, context) {
    if (!payload.graph) {
      this.send('error', new Error('No graph specified'), context);
      return null;
    }
    if (!this.traces[payload.graph]) {
      this.send('error', new Error(`Trace for requested graph '${payload.graph}' not found`), context);
      return null;
    }
    return this.traces[payload.graph];
  }

  start(payload, context) {
    const network = this.transport.network.getNetwork(payload.graph);
    if (!network) {
      this.send('error', new Error(`Network for requested graph '${payload.graph}' not found`), context);
      return;
    }
    const buffersize = payload.buffersize || 400;
    const metadata = this.transport.runtime.getRuntimeDefinition();
    this.traces[payload.graph] = new Flowtrace(metadata, buffersize);
    network.setFlowtrace(this.traces[payload.graph], payload.graph, true);
    this.sendAll('start', {
      graph: payload.graph,
      buffersize,
    });
  }

  stop(payload, context) {
    const tracer = this.resolveGraph(payload, context);
    if (!tracer) {
      return;
    }
    const network = this.transport.network.getNetwork(payload.graph);
    if (!network) {
      this.send('error', new Error(`Network for requested graph '${payload.graph}' not found`), context);
      return;
    }
    network.setFlowtrace(null);
    this.sendAll('stop', {
      graph: payload.graph,
    });
  }

  dump(payload, context) {
    const tracer = this.resolveGraph(payload, context);
    if (!tracer) {
      return;
    }
    this.send('dump', {
      graph: payload.graph,
      type: 'flowtrace.json',
      flowtrace: tracer.toJSON(),
    }, context);
  }

  clear(payload, context) {
    const tracer = this.resolveGraph(payload, context);
    if (!tracer) {
      return;
    }
    tracer.clear();
    this.sendAll('clear', {
      graph: payload.graph,
    });
  }
}

module.exports = TraceProtocol;
