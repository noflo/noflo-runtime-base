protocols =
  Runtime: require './protocol/Runtime'
  Graph: require './protocol/Graph'
  Network: require './protocol/Network'
  Component: require './protocol/Component'

# This is the class all NoFlo runtime implementations can extend to easily wrap
# into any transport protocol.
class BaseTransport
  constructor: (@options) ->
    @options = {} unless @options
    @version = '0.4'
    @runtime = new protocols.Runtime @
    @component = new protocols.Component @
    @graph = new protocols.Graph @
    @network = new protocols.Network @
    @context = null

    if @options.defaultGraph?
      @options.defaultGraph.baseDir = @options.baseDir
      path = 'default/main'
      @context = 'none'
      @graph.registerGraph path, @options.defaultGraph
      @network.initNetwork @options.defaultGraph, { graph: path }, @context

    if @options.captureOutput? and @options.captureOutput
      # Start capturing so that we can send it to the UI when it connects
      @startCapture()

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
    @context = context
    switch protocol
      when 'runtime' then @runtime.receive topic, payload, context
      when 'graph' then @graph.receive topic, payload, context
      when 'network' then @network.receive topic, payload, context
      when 'component' then @component.receive topic, payload, context

module.exports = BaseTransport
