const {
  EventEmitter,
} = require('events');

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
      payload,
    };
    return this.emit('send', m);
  }

  _receive(message) {
    return setTimeout(() => this.emit('message', message),
      1);
  }
}

module.exports = DirectClient;
