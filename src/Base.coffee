protocols =
  Runtime: require './protocol/Runtime'
  Graph: require './protocol/Graph'
  Network: require './protocol/Network'
  Component: require './protocol/Component'

debugMessagingReceive = require('debug') 'noflo-runtime-base:messaging:receive'
debugMessagingReceivePayload = require('debug') 'noflo-runtime-base:messaging:receive:payload'
debugMessagingSend = require('debug') 'noflo-runtime-base:messaging:send'
debugMessagingSendPayload = require('debug') 'noflo-runtime-base:messaging:send:payload'

# This is the class all NoFlo runtime implementations can extend to easily wrap
# into any transport protocol.
class BaseTransport
  constructor: (@options) ->
    @options = {} unless @options
    @version = '0.7'
    @component = new protocols.Component @
    @graph = new protocols.Graph @
    @network = new protocols.Network @
    @runtime = new protocols.Runtime @
    @context = null

    if @options.defaultGraph?
      @options.defaultGraph.baseDir = @options.baseDir
      graphName = @_getGraphName(@options.defaultGraph)
      @context = 'none'
      @graph.registerGraph graphName, @options.defaultGraph
      @runtime.setMainGraph graphName, @options.defaultGraph
      @network._startNetwork @options.defaultGraph, graphName, @context, (err) ->
        throw err if err

    if @options.captureOutput? and @options.captureOutput
      # Start capturing so that we can send it to the UI when it connects
      @startCapture()

    unless @options.capabilities
      @options.capabilities = [
        'protocol:graph'
        'protocol:component'
        'protocol:network'
        'protocol:runtime'
        'component:setsource'
        'component:getsource'
        'graph:readonly'
        'network:data'
        'network:control'
        'network:status'
      ]

    unless @options.defaultPermissions
      # Default: no capabilities granted for anonymous users
      @options.defaultPermissions = []

    unless @options.permissions
      @options.permissions = {}

  # Generate a name for the main graph
  _getGraphName: (graph) ->
    namespace = @options.namespace or 'default'
    graphName = graph.name or 'main'
    return "#{namespace}/#{graphName}"

  # Check if a given user is authorized for a given capability
  #
  # @param [Array] Capabilities to check
  # @param [String] Secret provided by user
  canDo: (capability, secret) ->
    if typeof capability is 'string'
      checkCapabilities = [capability]
    else
      checkCapabilities = capability
    userCapabilities = @getPermitted secret
    permitted = checkCapabilities.filter (perm) -> perm in userCapabilities
    if permitted.length > 0
      return true
    false

  # Check if a given user is authorized to send a given message
  canInput: (protocol, topic, secret) ->
    if protocol is 'graph'
      # All graph messages are under the same capability
      return @canDo ['protocol:graph'], secret
    message = "#{protocol}:#{topic}"
    switch message
      when 'component:list' then return @canDo ['protocol:component'], secret
      when 'component:getsource' then return @canDo ['component:getsource'], secret
      when 'component:source' then return @canDo ['component:setsource'], secret
      when 'network:edges' then return @canDo ['network:data', 'protocol:network'], secret
      when 'network:start' then return @canDo ['network:control', 'protocol:network'], secret
      when 'network:stop' then return @canDo ['network:control', 'protocol:network'], secret
      when 'network:debug' then return @canDo ['network:control', 'protocol:network'], secret
      when 'network:getstatus' then return @canDo ['network:status', 'network:control', 'protocol:network'], secret
      when 'runtime:getruntime' then return true
      when 'runtime:packet' then return @canDo ['protocol:runtime'], secret
    return false

  # Get enabled capabilities for a user
  #
  # @param [String] Secret provided by user
  getPermitted: (secret) ->
    unless secret
      return @options.defaultPermissions
    unless @options.permissions[secret]
      return []
    @options.permissions[secret]

  # Send a message back to the user via the transport protocol.
  #
  # Each transport implementation should provide their own implementation
  # of this method.
  #
  # The context is usually the context originally received from the
  # transport with the request. This could be an iframe origin or a
  # specific WebSocket connection.
  #
  # @param [String] Name of the protocol
  # @param [String] Topic of the message
  # @param [Object] Message payload
  # @param [Object] Message context, dependent on the transport
  send: (protocol, topic, payload, context) ->
    debugMessagingSend "#{protocol} #{topic}"
    debugMessagingSendPayload payload
   
  # Send a message to *all users*  via the transport protocol
  #
  # The transport should verify that the recipients are authorized to receive
  # the message by using the `canDo` method.
  #
  # Like send() only it sends to all.
  # @param [Object] Message context, can be null
  sendAll: (protocol, topic, payload, context) ->

  # This is the entry-point to actual protocol handlers. When receiving
  # a message, the runtime should call this to make the requested actions
  # happen
  #
  # The context is originally received from the transport. This could be
  # an iframe origin or a specific WebSocket connection. The context will
  # be utilized when sending messages back to the requester.
  #
  # @param [String] Name of the protocol
  # @param [String] Topic of the message
  # @param [Object] Message payload
  # @param [Object] Message context, dependent on the transport
  receive: (protocol, topic, payload, context) ->
    payload = {} unless payload
    debugMessagingReceive "#{protocol} #{topic}"
    debugMessagingReceivePayload payload

    unless @canInput protocol, topic, payload.secret
      @send protocol, 'error', new Error("#{protocol}:#{topic} is not permitted"), context
      return

    @context = context
    switch protocol
      when 'runtime' then @runtime.receive topic, payload, context
      when 'graph' then @graph.receive topic, payload, context
      when 'network' then @network.receive topic, payload, context
      when 'component' then @component.receive topic, payload, context
      else @send protocol, 'error', new Error("Protocol #{protocol} is not supported"), context

module.exports = BaseTransport
module.exports.trace = require './trace'
module.exports.direct = require './direct'
