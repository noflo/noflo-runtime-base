noflo = require 'noflo'

if noflo.isBrowser()
  Base = require 'noflo-runtime-base'
else
  Base = require '../Base'

describe 'Extending the runtime baseclass', ->
  describe 'with a CoffeeScript-compiled class', ->
    MyRuntime = null
    it 'should work', ->
      class MyRuntime extends Base
        constructor: ->
          super()
        send: (protocol, topic, payload, ctx) ->
    it 'should be possible to instantiate', ->
      rt = new MyRuntime
      rt.send()
      rt.canDo('protocol:graph')
  describe.skip 'with ES5-style extending', ->
    MyRuntime = null
    it 'should work', ->
      MyRuntime = (options) ->
        @prototype.constructor.apply @, arguments
      MyRuntime.prototype = Base
    it 'should be possible to instantiate', ->
      rt = new MyRuntime
      rt.send()
      rt.canDo('protocol:graph')
