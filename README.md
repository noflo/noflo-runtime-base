NoFlo Base Runtime [![Build Status](https://travis-ci.org/noflo/noflo-runtime-base.svg?branch=master)](https://travis-ci.org/noflo/noflo-runtime-base) [![Coverage Status](https://coveralls.io/repos/github/noflo/noflo-runtime-base/badge.svg?branch=master)](https://coveralls.io/github/noflo/noflo-runtime-base?branch=master)
====

Base implementation of [FBP protocol](http://flowbased.github.io/fbp-protocol/) for NoFlo. Used by libraries implementing different transports, like [noflo-runtime-websocket](https://github.com/noflo/noflo-runtime-websocket) and [noflo-runtime-postmessage](https://github.com/noflo/noflo-runtime-postmessage).

## Changes

* 0.10.5 (February 23rd 2019)
  - Added `runtime.component` lifecycle event `updated` when component sources are modified via the protocol. Can be used to persist changes
  - Added `runtime.graph` lifecycle event `updated` when a graph is modified via the protocol. Can be used to persist changes
* 0.10.4 (December 1st 2018)
  - Typo fix for registering a main graph
* 0.10.3 (December 1st 2018)
  - Made the `defaultGraph` option use the project's actual namespace and graph name instead of hardcoded `default/main`
* 0.10.2 (March 30th 2018)
  - Ensured that `network:begingroup` and `network:endgroup` include the required `group` property
* 0.10.1 (March 29th 2018)
  - Made `runtime:ports` signal compatible with the FBP Protocol schema
  - Added responses to `renameinport` and `renameoutport` requests
* 0.10.0 (March 22nd 2018)
  - Added support for FBP Protocol 0.7
  - Changed the `component:component` message to conform with the FBP protocol schema
  - Ensured all graph protocol messages get a response
  - Added support for the `network:control`, `network:status`, and `network:data` capabilities
  - Added `runtime:packetsent` response to `runtime:packet` requests
  - Added error responses for unsupported subprotocols and commands
  - Improved error handling when trying to receive packets from unavailable exported outports

* 0.9.3 (February 19th 2018)
  - Improved error handling when starting a new network
