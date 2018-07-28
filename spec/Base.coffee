noflo = require 'noflo'

if noflo.isBrowser()
  direct = require('noflo-runtime-base').direct
  baseDir = 'noflo-runtime-base'
else
  chai = require 'chai' unless chai
  direct = require '../direct'
  path = require 'path'
  baseDir = path.resolve __dirname, '../'

describe 'Base interface', ->
  describe 'with a working default graph', ->
    it 'should register and run a network', (done) ->
      graphData =
        processes:
          Node1:
            component: 'core/Repeat'
        connections: [
          data: 'My message to print'
          tgt:
            process: 'Node1'
            port: 'in'
        ]
      startReceived = false
      noflo.graph.loadJSON graphData, (err, graph) ->
        return done err if err
        rt = new direct.Runtime
          defaultGraph: graph
          baseDir: baseDir
        rt.network.on 'addnetwork', (network) ->
          network.on 'start', ->
            startReceived = true
          network.on 'end', ->
            chai.expect(startReceived, 'should have received start').to.equal true
            done()
