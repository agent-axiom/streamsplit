import { JSONParser } from '@streamparser/json';

/** Compare complete selected values, not chunk-dependent partial previews. */
export function streamJsonAdapter(emit, { paths = ['$'], separator } = {}) {
  const parser = new JSONParser({ paths, separator, keepStack: false });
  // parent/stack are live parser internals; emit only each completed value.
  parser.onValue = ({ value }) => emit(value);
  return {
    write(chunk) { parser.write(chunk); },
    // A complete single root can end the parser before the source reaches EOF.
    end() { if (!parser.isEnded) parser.end(); },
  };
}
