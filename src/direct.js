/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const isBrowser = () => !((typeof process !== 'undefined') && process.execPath && (process.execPath.indexOf('node') !== -1));

const Base = require('./Base');
const {
  EventEmitter
} = require('events');

class DirectRuntime extends Base {
  constructor(options) {
    super(options);
    this.clients = [];
  }

  _connect(client) {
    this.clients.push(client);
    return client.on('send', msg => {
      // Capture context
      return this._receive(msg, { client });
  });
  }

  _disconnect(client) {
    if (this.clients.indexOf(client) === -1) { return; }
    this.clients.splice(this.clients.indexOf(client), 1);
    return client.removeAllListeners('send'); // XXX: a bit heavy
  }

  _receive(msg, context) {
    // Forward to Base
    return this.receive(msg.protocol, msg.command, msg.payload, context);
  }

  send(protocol, topic, payload, context) {
    if (!context.client) { return; }
    const m = {
      protocol,
      command: topic,
      payload
    };
    return context.client._receive(m);
  }

  sendAll(protocol, topic, payload) {
    const m = {
      protocol,
      command: topic,
      payload
    };
    return Array.from(this.clients).map((client) =>
      client._receive(m));
  }
}
    
// Mostly used for testing
class DirectClient extends EventEmitter {
  constructor(runtime, name) {
    super();
    this.name = name;
    this.runtime = runtime;
    if (!this.name) { this.name = 'Unnamed client'; }
  }

  connect() {
    return this.runtime._connect(this);
  }

  disconnect() {
    return this.runtime._disconnect(this);
  }

  send(protocol, topic, payload) {
    const m = {
      protocol,
      command: topic,
      payload
    };
    return this.emit('send', m);
  }

  _receive(message) {
    return setTimeout(() => {
      return this.emit('message', message);
    }
    , 1);
  }
}

exports.Client = DirectClient;
exports.Runtime = DirectRuntime;
