noflo = require 'noflo'

if noflo.isBrowser()
  Base = require 'noflo-runtime-base'
else
  Base = require '../Base'

describe 'Extending the runtime baseclass', ->
  MyRuntime = null
  it 'should work', ->
    class MyRuntime extends Base
      constructor: ->
        super()
      send: (protocol, topic, payload, ctx) ->
  it 'should be possible to instantiate', ->
    rt = new MyRuntime
    rt.send()
