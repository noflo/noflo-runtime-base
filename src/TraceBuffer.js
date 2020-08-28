class TraceBuffer {
  constructor() {
    this.events = []; // PERF: use a linked-list variety instead
  }

  add(event) {
    // FIXME: respect a (configurable) limit on size https://github.com/noflo/noflo-runtime-base/issues/34
    this.events.push(event);
  }

  getAll(consumeFunc, doneFunc) {
    this.events.forEach((e) => {
      consumeFunc(e);
    });
    doneFunc(null);
  }
}

module.exports = TraceBuffer;
