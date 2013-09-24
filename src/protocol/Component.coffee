noflo = require 'noflo'

class ComponentProtocol
  constructor: (@transport) ->

  send: (topic, payload, context) ->
    @transport.send 'component', topic, payload, context

  receive: (topic, payload, context) ->
    switch topic
      when 'list' then @listComponents payload, context

  listComponents: (baseDir, context) ->
    loader = new noflo.ComponentLoader baseDir
    loader.listComponents (components) =>
      Object.keys(components).forEach (component) =>
        loader.load component, (instance) =>
          unless instance.isReady()
            instance.once 'ready', =>
              @sendComponent component, instance, context
            return
          @sendComponent component, instance, context

  sendComponent: (component, instance, context) ->
    inPorts = []
    outPorts = []
    for portName, port of instance.inPorts
      inPorts.push
        id: portName
        type: port.type
    for portName, port of instance.outPorts
      outPorts.push
        id: portName
        type: port.type
    @send 'component',
      name: component
      description: instance.description
      inPorts: inPorts
      outPorts: outPorts
    , context

module.exports = ComponentProtocol
