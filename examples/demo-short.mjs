import { checkChunkInvariant, assertChunkInvariant, replayChunkInvariant } from '../dist/index.js';
import { brokenSseDataParser, sseDataParser } from './parsers.mjs';

const lines = [];
const log = line => lines.push(line);
const input = new TextEncoder().encode('data: Hello 🌍\r\n\r\n');
const baseline = [];
const parser = brokenSseDataParser(event => baseline.push(event));
parser.write(input);
parser.end();
log('1/4  WHOLE BUFFER: PASS');
log(`     ${JSON.stringify(baseline)}`);

const result = await checkChunkInvariant({ input, createParser: brokenSseDataParser, seed: 42 });
if (result.ok) throw new Error('Expected the broken decoder to fail.');
log('2/4  SPLIT UTF-8: FAIL');
log(`     Reduced chunk sizes: ${JSON.stringify(result.failure.fixture.chunkSizes)}`);
log(`     ${JSON.stringify(result.failure.actual.events)}`);

log('3/4  ONE-LINE FIX');
log('     decoder.decode(chunk, { stream: true })');

const replay = await replayChunkInvariant({ fixture: result.failure.fixture, createParser: sseDataParser });
if (!replay.ok) throw new Error('The fixed decoder did not fix the saved fixture.');
const coverage = await assertChunkInvariant({ input, createParser: sseDataParser, seed: 42 });
log('4/4  FIXED: PASS');
log(`     Exact fixture + ${coverage.schedulesChecked} tested schedules`);
log('     Synthetic fixture. No network. Zero runtime dependencies.');

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ inputBytes: input.length, inputHex: Buffer.from(input).toString('hex'), baseline, actual: result.failure.actual.events, chunkSizes: result.failure.fixture.chunkSizes, schedulesChecked: coverage.schedulesChecked, fixedReplay: replay.ok }));
} else {
  console.log(lines.join('\n'));
}
