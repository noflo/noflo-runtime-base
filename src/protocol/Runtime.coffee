noflo = require 'noflo'

class RuntimeProtocol
  constructor: (@transport) ->

  send: (topic, payload, context) ->
    @transport.send 'runtime', topic, payload, context

  receive: (topic, payload, context) ->
    switch topic
      when 'getruntime' then @getRuntime payload, context
      when 'packet' then @receivePacket payload, context

  getRuntime: (payload, context) ->
    type = @transport.type
    unless type
      if noflo.isBrowser()
        type = 'noflo-browser'
      else
        type = 'noflo-nodejs'
    @send 'runtime',
      type: type
      version: @transport.version
      capabilities: [
        'protocol:graph'
        'protocol:component'
        'protocol:network'
        'component:setsource'
        'component:getsource'
      ]
    , context

  receivePacket: (payload, context) ->
    @send 'error', new Error('Packets not supported yet'), context

module.exports = RuntimeProtocol
