noflo = require 'noflo'

if noflo.isBrowser()
  direct = require('noflo-runtime-base').direct
  { Tracer } = require('noflo-runtime-base').trace
  baseDir = '/noflo-runtime-base'
else
  chai = require 'chai' unless chai
  direct = require '../direct'
  { Tracer } = require '../trace'
  path = require 'path'
  baseDir = path.resolve __dirname, '../'

describe 'Tracer', ->
  tracer = null

  describe.skip 'attached to Noflo.Component', ->
    component = null
    trace = null

    before (done) ->
      @timeout 20*1000
      console.log 'before', Tracer
      tracer = new Tracer
      loader = new noflo.ComponentLoader baseDir
      loader.load 'noflo-runtime-base/TestRepeats', (err, instance) ->
        return done err if err
        component = instance
        component.once 'ready', ->
          tracer.attach instance.network
          setTimeout done, 1

    after (done) ->
      @timeout 10*1000
      done()

    it 'should collect data coming through', (done) ->
      component.once 'stop', () ->
        tracer.dumpString (err, f) ->
          return done err if err
        console.log 'Wrote flowtrace to', f
        done()

      component.start()

    it 'trace should contain graph'

    it 'trace should contain subgraphs'

    it 'trace should have data events'

    it 'trace should have groups events'

    it 'trace should have data send from exported outport'

    it 'trace should have data send to exported inport'

  describe 'tracing unserializable events', ->
    it 'should drop only those events'


describe 'FBP protocol tracing', ->

  # TODO: https://github.com/noflo/noflo-runtime-base/issues/36
  describe 'runtime with trace=true', ->
    describe 'triggering trace', ->
      it 'should return trace'
