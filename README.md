NoFlo Base Runtime
====

Base implementation of [FBP protocol](http://flowbased.github.io/fbp-protocol/) for NoFlo. Used by libraries implementing different transports, like [noflo-runtime-websocket](https://github.com/noflo/noflo-runtime-websocket) and [noflo-runtime-postmessage](https://github.com/noflo/noflo-runtime-postmessage).

## Changes

* 0.11.8 (November 16th 2020)
  - Compatibility improvements with the fbp-protocol test suite
* 0.11.7 (November 16th 2020)
  - Compatibility with the TypeScript version of fbp-graph
* 0.11.6 (November 11th 2020)
  - Fixed sending of object payloads via `network:data` message
  - Fixed library name incompatibility with fbp-protocol
* 0.11.5 (September 25th 2020)
  - fbp-spec graphs (`fixture.xx`) are now special-cased so that they don't get registered as components
  - Fixed issue with namespacing graph components
* 0.11.4 (September 23rd 2020)
  - Component sub-protocol now also emits component tests at `setSource`
* 0.11.3 (September 23rd 2020)
  - The NoFlo runtime now handles graph names in a more consistent manner. When graphs/networks are instantiated by the runtime, they are always namespaced
* 0.11.2 (September 18th 2020)
  - The runtime now emits a `ready` or `error` after construction dependending on main graph initialization result
* 0.11.1 (September 4th 2020)
  - The runtime instantiates networks now for all graphs in the current project in addition to the "main" graph
* 0.11.0 (September 1st 2020)
  - NoFlo Networks are now instantiated for all graphs, meaning that graph operations fail more gracefully and networks start faster
  - Ported from CoffeeScript to ES6
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
