/* eslint class-methods-use-this: ["error", { "exceptMethods": ["processPort"] }] */
const noflo = require('noflo');
const debounce = require('debounce');
const {
  EventEmitter,
} = require('events');
const { parseName } = require('../utils');

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

  getLoader(baseDir, options = {}) {
    if (!this.loaders[baseDir]) {
      this.loaders[baseDir] = new noflo.ComponentLoader(baseDir, options);
    }

    return this.loaders[baseDir];
  }

  listComponents(payload, context) {
    const {
      baseDir,
    } = this.transport.options;
    const loader = this.getLoader(baseDir, this.transport.options);
    return loader.listComponents((err, components) => {
      if (err) {
        this.send('error', err, context);
        return;
      }
      const componentNames = Object.keys(components);
      let processed = 0;
      componentNames.forEach((component) => {
        this.processComponent(loader, component, context, (error) => {
          if (error) {
            this.send('error', error, context);
            processed += 1;
            return;
          }
          processed += 1;
          if (processed < componentNames.length) { return; }
          this.send('componentsready', processed, context);
        });
      });
    });
  }

  getSource(payload, context) {
    const {
      baseDir,
    } = this.transport.options;
    const loader = this.getLoader(baseDir, this.transport.options);
    return loader.getSource(payload.name, (err, component) => {
      if (err) {
        // Try one of the registered graphs
        const nameParts = parseName(payload.name);
        const graph = this.transport.graph.graphs[payload.name]
          || this.transport.graph.graphs[nameParts.name];
        if (graph == null) {
          this.send('error', err, context);
          return;
        }

        this.send('source', {
          name: nameParts.name,
          library: nameParts.library,
          code: JSON.stringify(graph.toJSON()),
          language: 'json',
        },
        context);
        return;
      }
      this.send('source', component, context);
    });
  }

  setSource(payload, context) {
    const {
      baseDir,
    } = this.transport.options;
    const loader = this.getLoader(baseDir, this.transport.options);
    loader.setSource(payload.library, payload.name, payload.code, payload.language, (err) => {
      if (err) {
        this.send('error', err, context);
        return;
      }
      this.emit('updated', {
        name: payload.name,
        library: payload.library,
        code: payload.code,
        tests: payload.tests,
        language: payload.language,
      });
      this.processComponent(loader, loader.normalizeName(payload.library, payload.name), context);
    });
  }

  processComponent(loader, component, context, callback = () => {}) {
    return loader.load(component, (err, instance) => {
      if (err) {
        this.send('error', err, context);
        callback(err);
        return;
      }
      const { library, name: componentName } = parseName(component);
      // Ensure graphs are not run automatically when just querying their ports
      if (!instance.isReady()) {
        instance.once('ready', () => {
          if (instance.isSubgraph()
            && library === this.transport.options.namespace
            && !this.transport.graph.graphs[componentName]) {
            // Register subgraph also to the graph protocol handler
            this.transport.graph.registerGraph(component, instance.network.graph, null, false);
          }
          this.sendComponent(component, instance, context);
          callback(null);
        });
        return;
      }
      if (instance.isSubgraph()
        && library === this.transport.options.namespace
        && !this.transport.graph.graphs[component]) {
        // Register subgraph also to the graph protocol handler
        this.transport.graph.registerGraph(componentName, instance.network.graph, null, false);
      }
      this.sendComponent(component, instance, context);
      callback(null);
    },
    true);
  }

  processPort(portName, port) {
    // Required port properties
    const portDef = {
      id: portName,
      type: port.getDataType ? port.getDataType() : 'all',
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
    const inPorts = [];
    const outPorts = [];
    Object.keys(instance.inPorts).forEach((portName) => {
      const port = instance.inPorts[portName];
      if (!port || (typeof port === 'function') || !port.canAttach) { return; }
      inPorts.push(this.processPort(portName, port));
    });
    Object.keys(instance.outPorts).forEach((portName) => {
      const port = instance.outPorts[portName];
      if (!port || (typeof port === 'function') || !port.canAttach) { return; }
      outPorts.push(this.processPort(portName, port));
    });

    const icon = instance.getIcon ? instance.getIcon() : 'gear';

    this.send('component', {
      name: component,
      description: instance.description,
      subgraph: instance.isSubgraph(),
      icon,
      inPorts,
      outPorts,
    },
    context);
  }

  registerGraph(id, graph, context) {
    const loader = this.getLoader(graph.baseDir, this.transport.options);
    const sender = () => this.processComponent(loader, id, context);
    const send = debounce(sender, 10);
    loader.listComponents((err) => {
      if (err) {
        this.send('error', err, context);
        return;
      }
      loader.registerComponent(graph.properties.library, id, graph);
      // Send initial graph info back to client
      send();
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
    graph.on('renameOutport', send);
  }
}
ComponentProtocol.initClass();

module.exports = ComponentProtocol;
