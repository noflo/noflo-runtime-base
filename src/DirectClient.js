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
    return new Promise((resolve, reject) => {
      const m = {
        protocol,
        command: topic,
        payload,
      };
      const onMsg = (msg) => {
        if (msg.protocol !== protocol) {
          // Unrelated, wait for next
          this.once('message', onMsg);
        }
        if (msg.command === 'error') {
          reject(new Error(msg.payload.message));
          return;
        }
        resolve(msg.payload);
      };
      this.once('message', onMsg);
      this.emit('send', m);
    });
  }

  _receive(message) {
    return setTimeout(() => {
      this.emit('message', message);
    }, 1);
  }
}

module.exports = DirectClient;
