import ndjson from 'ndjson';

/** Adapt the real ndjson Transform stream without decoding its bytes ourselves. */
export function ndjsonAdapter(emit, { strict = true } = {}) {
  const parser = ndjson.parse({ strict });
  let failure;
  let emissionFailure;
  parser.on('error', error => { failure ??= error; });
  parser.on('data', value => {
    try { emit(value); }
    catch (error) { emissionFailure ??= error; }
  });
  const verify = () => { if (emissionFailure) throw emissionFailure; if (failure) throw failure; };
  return {
    async write(chunk) {
      verify();
      await new Promise((resolve, reject) => {
        parser.write(Buffer.from(chunk), error => error ? reject(error) : resolve());
      });
      verify();
    },
    async end() {
      verify();
      await new Promise((resolve, reject) => {
        // Attaching before end handles synchronous final output and end/error events.
        const done = () => { parser.off('error', failed); resolve(); };
        const failed = error => { parser.off('end', done); reject(error); };
        parser.once('end', done);
        parser.once('error', failed);
        parser.end();
      });
      verify();
    },
  };
}
