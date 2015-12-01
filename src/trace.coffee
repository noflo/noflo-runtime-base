
noflo = require 'noflo'
debug = require('debug')('noflo-runtime-base:trace')
jsonStringify = JSON.stringify
try
  jsonStringify = require 'json-stringify-safe'
catch e
  console.log "WARN: failed to load json-stringify-safe, circular objects may cause fail.\n#{e.message}"

clone = (obj) ->
  s = jsonStringify obj
  return JSON.parse s


class TraceBuffer
  constructor: () ->
    @events = [] # PERF: use a linked-list variety instead

  add: (event) ->
    # FIXME: respect a (configurable) limit on size https://github.com/noflo/noflo-runtime-base/issues/34
    @events.push event

  getAll: (consumeFunc, doneFunc) ->
    for e in @events
      consumeFunc e
    return doneFunc null

subscribeExportedOutports = (network, networkId, eventNames, subscribeFunc) ->
  graphSockets = {}

  # Basically same as code in runtime:data protocol handling
  for pub, internal of network.graph.outports
    socket = noflo.internalSocket.createSocket()
    graphSockets[pub] = socket
    component = network.processes[internal.process].component
    component.outPorts[internal.port].attach socket
    sendFunc = (event) ->
      return (payload) ->
        data =
          id: "EXPORT: #{networkId} #{pub.toUpperCase()} ->" # just for debugging
          payload: payload
          socket:
            to:
              process: { id: networkId }
              port: pub
        subscribeFunc event, data

    for event in eventNames
      socket.on event, sendFunc(event)
  return graphSockets

# Convert to flowtrace/FBP-protocol format http://noflojs.org/documentation/protocol/
networkToTraceEvent = (networkId, type, data) ->

  debug 'event', networkId, type, "'#{data.id}'"
  socket = data.socket

  # XXX: wasteful to have the network thing in each event?
  event =
    protocol: 'network'
    command: type
    payload:
      time: new Date().toISOString()
      graph: networkId
      error: null # used to indicate tracing errors
      src:
        node: socket.from?.process.id
        port: socket.from?.port
      tgt:
        node: socket.to?.process.id
        port: socket.to?.port
      id: undefined # deprecated
      subgraph: undefined # TODO: implement

  serializeGroup = (p) ->
    try
      p.group = data.group.toString()
    catch e
      debug 'group serialization error', e
      p.error = e.message

  p = event.payload
  switch type
    when 'connect' then null
    when 'disconnect' then null
    when 'begingroup' then serializeGroup event.payload
    when 'endgroup' then serializeGroup event.payload
    when 'data'
      try
        p.data = clone data.data
      catch e
        debug 'data serialization error', e
        p.error = e.message
    else
      throw new Error "trace: Unknown event type #{type}"

  debug 'event done', networkId, type, "'#{data.id}'"
  return event

# Can be attached() to a NoFlo network, and keeps a circular buffer of events
# which can be persisted on request
class Tracer
  constructor: (@options) ->
    @buffer = new TraceBuffer
    @header =
      graphs: {}

  attach: (network) ->
    # FIXME: graphs loaded from .fbp don't have name. Should default to basename of file, and be configurable
    netId = network.graph.name or network.graph.properties.name or 'default'
    debug 'attach', netId
    eventNames = [
      'connect'
      'begingroup'
      'data'
      'endgroup'
      'disconnect'
    ]
    # internal network events
    eventNames.forEach (event) =>
      network.on event, (data) =>
        payload = networkToTraceEvent netId, event, data
        @buffer.add payload
    # exported outport
    sockets = subscribeExportedOutports network, netId, eventNames, (event, data) =>
      payload = networkToTraceEvent netId, event, data
      @buffer.add payload

    @header.graphs[netId] = network.graph.toJSON()

  detach: (network) ->
    # TODO: implement
    return

  # Serialize current content of buffer
  dumpString: (callback) ->
    events = []
    consume = (e) ->
      events.push e
    @buffer.getAll consume, (err) =>
      trace =
        header: @header
        events: events
      return callback err, JSON.stringify trace, null, 2

  # node.js only
  dumpFile: (filepath, callback) ->
    fs = require 'fs'
    temp = require 'temp'

    openFile = (cb) ->
      fs.open filepath, 'w', (err, fd) ->
        cb err, { path: filepath, fd: fd }
    if not filepath
      openFile = (cb) ->
        temp.open { suffix: '.json' }, cb

    openFile (err, info) =>
      return callback err if err

      # HACKY json streaming serialization
      events = 0
      write = (data, cb) ->
        fs.write info.fd, data, { encoding: 'utf-8' }, cb
      writeEvent = (e) ->
        s = if events then ',' else ''
        events += 1
        s += JSON.stringify e, null, 2
        write s, (err) ->
          # FIXME: handle, wait

      debug 'streaming to file', info.path
      header = JSON.stringify @header, null, 2
      write "{\n \"header\": #{header}\n, \"events\":\n[", (err) =>
        @buffer.getAll writeEvent, (err) ->
          return callback err if err
          debug "streamed #{events} events"
          write ']\n }', (err) ->
            debug "completed stream", info.path
            return callback err, info.path


module.exports.Tracer = Tracer
