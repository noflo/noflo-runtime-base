/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const noflo = require('noflo');
const debounce = require('debounce');
const {
  EventEmitter
} = require('events');
const utils = require('../utils');

class ComponentProtocol extends EventEmitter {
  static initClass() {
    this.prototype.loaders = {};
  }
  constructor(transport) {
    super();
    this.transport = transport;
  }

  send(topic, payload, context) {
    return this.transport.send('component', topic, payload, context);
  }

  receive(topic, payload, context) {
    switch (topic) {
      case 'list': return this.listComponents(payload, context);
      case 'getsource': return this.getSource(payload, context);
      case 'source': return this.setSource(payload, context);
      default: return this.send('error', new Error(`component:${topic} not supported`), context);
    }
  }

  getLoader(baseDir, options) {
    if (options == null) { options = {}; }
    if (!this.loaders[baseDir]) {
      this.loaders[baseDir] = new noflo.ComponentLoader(baseDir, options);
    }

    return this.loaders[baseDir];
  }

  listComponents(payload, context) {
    const {
      baseDir
    } = this.transport.options;
    const loader = this.getLoader(baseDir, this.transport.options);
    return loader.listComponents((err, components) => {
      if (err) {
        this.send('error', err, context);
        return;
      }
      const componentNames = Object.keys(components);
      let processed = 0;
      return componentNames.forEach(component => {
        return this.processComponent(loader, component, context, err => {
          processed++;
          if (processed < componentNames.length) { return; }
          return this.send('componentsready', processed, context);
        });
      });
    });
  }

  getSource(payload, context) {
    const {
      baseDir
    } = this.transport.options;
    const loader = this.getLoader(baseDir, this.transport.options);
    return loader.getSource(payload.name, (err, component) => {
      if (err) {
        // Try one of the registered graphs
        const graph = this.transport.graph.graphs[payload.name];
        if (graph == null) {
          this.send('error', err, context);
          return;
        }

        const nameParts = utils.parseName(payload.name);
        return this.send('source', {
          name: nameParts.name,
          library: nameParts.library,
          code: JSON.stringify(graph.toJSON()),
          language: 'json'
        }
        , context);
      } else {
        return this.send('source', component, context);
      }
    });
  }

  setSource(payload, context) {
    const {
      baseDir
    } = this.transport.options;
    const loader = this.getLoader(baseDir, this.transport.options);
    return loader.setSource(payload.library, payload.name, payload.code, payload.language, err => {
      if (err) {
        this.send('error', err, context);
        return;
      }
      this.emit('updated', {
        name: payload.name,
        library: payload.library,
        code: payload.code,
        language: payload.language
      }
      );
      return this.processComponent(loader, loader.normalizeName(payload.library, payload.name), context);
    });
  }

  processComponent(loader, component, context, callback) {
    if (!callback) {
      callback = function() {};
    }

    return loader.load(component, (err, instance) => {
      if (!instance) {
        if (err instanceof Error) {
          this.send('error', err, context);
          return callback(err);
        }
        instance = err;
      }

      // Ensure graphs are not run automatically when just querying their ports
      if (!instance.isReady()) {
        instance.once('ready', () => {
          this.sendComponent(component, instance, context);
          return callback(null);
        });
        return;
      }
      this.sendComponent(component, instance, context);
      return callback(null);
    }
    , true);
  }

  processPort(portName, port) {
    // Required port properties
    const portDef = {
      id: portName,
      type: port.getDataType ? port.getDataType() : 'all'
    };
    if (typeof port.getSchema === 'function' ? port.getSchema() : undefined) {
      portDef.schema = port.getSchema();
    }
    if (port.isRequired) {
      portDef.required = port.isRequired();
    }
    if (port.isAddressable) {
      portDef.addressable = port.isAddressable();
    }
    if (port.getDescription) {
      portDef.description = port.getDescription();
    }
    if (port.options != null ? port.options.values : undefined) {
      portDef.values = port.options.values;
    }
    if (typeof port.hasDefault === 'function' ? port.hasDefault() : undefined) {
      portDef.default = port.options.default;
    }
    return portDef;
  }

  sendComponent(component, instance, context) {
    let port, portName;
    const inPorts = [];
    const outPorts = [];
    for (portName in instance.inPorts) {
      port = instance.inPorts[portName];
      if (!port || (typeof port === 'function') || !port.canAttach) { continue; }
      inPorts.push(this.processPort(portName, port));
    }
    for (portName in instance.outPorts) {
      port = instance.outPorts[portName];
      if (!port || (typeof port === 'function') || !port.canAttach) { continue; }
      outPorts.push(this.processPort(portName, port));
    }

    const icon = instance.getIcon ? instance.getIcon() : 'gear';

    return this.send('component', {
      name: component,
      description: instance.description,
      subgraph: instance.isSubgraph(),
      icon,
      inPorts,
      outPorts
    }
    , context);
  }

  registerGraph(id, graph, context) {
    const sender = () => this.processComponent(loader, id, context);
    const send = debounce(sender, 10);
    var loader = this.getLoader(graph.baseDir, this.transport.options);
    loader.listComponents((err, components) => {
      if (err) {
        this.send('error', err, context);
        return;
      }
      loader.registerComponent('', id, graph);
      // Send initial graph info back to client
      return send();
    });

    // Send graph info again every time it changes so we get the updated ports
    graph.on('addNode', send);
    graph.on('removeNode', send);
    graph.on('renameNode', send);
    graph.on('addEdge', send);
    graph.on('removeEdge', send);
    graph.on('addInitial', send);
    graph.on('removeInitial', send);
    graph.on('addInport', send);
    graph.on('removeInport', send);
    graph.on('renameInport', send);
    graph.on('addOutport', send);
    graph.on('removeOutport', send);
    return graph.on('renameOutport', send);
  }
}
ComponentProtocol.initClass();

module.exports = ComponentProtocol;
