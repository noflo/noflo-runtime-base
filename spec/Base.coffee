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
  describe 'without a graph', ->
    it 'should become ready without network', (done) ->
      rt = new direct.Runtime
        baseDir: baseDir
      rt.on 'ready', (net) ->
        chai.expect(net).to.equal null
        done()
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
      readyReceived = false
      startReceived = false
      noflo.graph.loadJSON graphData, (err, graph) ->
        return done err if err
        rt = new direct.Runtime
          defaultGraph: graph
          baseDir: baseDir
        rt.on 'ready', (net) ->
          chai.expect(net).to.be.instanceof noflo.Network
          readyReceived = true
        rt.network.on 'addnetwork', (network) ->
          network.on 'start', ->
            startReceived = true
          network.on 'end', ->
            chai.expect(readyReceived, 'should have received ready').to.equal true
            chai.expect(startReceived, 'should have received start').to.equal true
            done()
  describe 'with a graph containing a faulty IIP', ->
    it 'should emit an error', (done) ->
      graphData =
        processes:
          Node1:
            component: 'core/Repeat'
        connections: [
          data: 'My message to print'
          tgt:
            process: 'Node1'
            port: 'missing'
        ]
      noflo.graph.loadJSON graphData, (err, graph) ->
        return done err if err
        rt = new direct.Runtime
          defaultGraph: graph
          baseDir: baseDir
        rt.on 'error', (err) ->
          chai.expect(err).to.be.an 'error'
          console.log err.message
          done()
