"""Versioned client measurements. Legacy rates remain immutable in rates.py."""
import math

PROTOCOL = 'core-client-v1'
FIELDS = ('protocolId', 'visibleTokens', 'firstChunkTokens', 'bodyTps', 'endToEndTps',
          'charsPerSec', 'chunkGapP50Ms', 'chunkGapP95Ms', 'chunkCount', 'sampleSeconds', 'bodyTpsState')


def quantile(values, p):
    if not values:
        return None
    values = sorted(values)
    x = (len(values) - 1) * p
    lo, hi = math.floor(x), math.ceil(x)
    return values[lo] + (values[hi] - values[lo]) * (x - lo)


def measure(status, chunks, visible_tokens, duration_seconds, first_chunk_tokens=None):
    """First-chunk counts must come from a declared cumulative per-chunk meter.

    No tokenizer, text-length heuristic or reasoning assumption fills missing counts.
    The first chunk is excluded from both rate numerators. SSE gaps are not ITL.
    """
    valid_count = lambda n: isinstance(n, int) and not isinstance(n, bool) and n >= 0
    if visible_tokens is not None and not valid_count(visible_tokens):
        raise ValueError('Visible token count must be a nonnegative integer or null')
    if first_chunk_tokens is not None and (not valid_count(first_chunk_tokens) or
            visible_tokens is None or first_chunk_tokens > visible_tokens):
        raise ValueError('Invalid first-chunk token count')
    if isinstance(duration_seconds, bool) or not isinstance(duration_seconds, (float, int)) or not math.isfinite(duration_seconds) or duration_seconds < 0:
        raise ValueError('Invalid request duration')
    chunks = list(chunks)
    if any(not isinstance(s, str) or isinstance(t, bool) or not isinstance(t, (int, float)) for t, s in chunks):
        raise ValueError('Invalid stream chunk')
    chunks = [(t, s) for t, s in chunks if s]
    if first_chunk_tokens is not None and not chunks:
        raise ValueError('First-chunk count requires a visible chunk')
    if any(not math.isfinite(t) or t < 0 or t > duration_seconds + .001 for t, _ in chunks) or any(
            chunks[i][0] < chunks[i - 1][0] for i in range(1, len(chunks))):
        raise ValueError('Invalid stream timing order')
    # Evidence timestamps have microsecond precision; make the eligibility boundary
    # use the same serialized interval as replay and public validation.
    span = round(chunks[-1][0] - chunks[0][0], 6) if len(chunks) >= 2 else None
    gaps = [(chunks[i][0] - chunks[i-1][0]) * 1000 for i in range(1, len(chunks))]
    enough = status == 'success' and len(chunks) >= 3 and span is not None and span >= .5
    state = ('request_incomplete' if status != 'success' else 'unknown_tokens' if visible_tokens is None
             else 'unknown_first_chunk' if first_chunk_tokens is None
             else 'insufficient_sample' if not enough or visible_tokens - first_chunk_tokens < 64 else 'measured')
    chars = sum(len(s) for _, s in chunks[1:])
    rounded = lambda x: round(x, 6) if x is not None else None
    return {'protocolId': PROTOCOL, 'visibleTokens': visible_tokens, 'firstChunkTokens': first_chunk_tokens,
            'bodyTps': rounded((visible_tokens-first_chunk_tokens)/span) if state == 'measured' else None,
            'endToEndTps': rounded(visible_tokens/duration_seconds) if status == 'success' and visible_tokens is not None and duration_seconds > 0 else None,
            'charsPerSec': rounded(chars/span) if enough and chars >= 64 else None,
            'chunkGapP50Ms': rounded(quantile(gaps,.5)) if status == 'success' else None,
            'chunkGapP95Ms': rounded(quantile(gaps,.95)) if status == 'success' else None,
            'chunkCount': len(chunks), 'sampleSeconds': rounded(span), 'bodyTpsState': state}


def validate_measurement(m, status, duration_ms):
    if not isinstance(m, dict) or m.get('protocolId') != PROTOCOL:
        raise ValueError('Unknown measurement protocol')
    for key in FIELDS:
        if key not in m:
            raise ValueError('Missing measurement field: ' + key)
    for key in FIELDS[1:]:
        if key == 'bodyTpsState':
            continue
        value = m[key]
        if value is not None and (isinstance(value, bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value < 0):
            raise ValueError('Invalid measurement number')
    for key in ('visibleTokens','firstChunkTokens','chunkCount'):
        if m[key] is not None and not isinstance(m[key],int):
            raise ValueError('Measurement counts must be integers')
    if m['chunkCount'] is None:
        raise ValueError('Chunk count is required')
    if isinstance(duration_ms, bool) or not isinstance(duration_ms, (int, float)) or not math.isfinite(duration_ms) or duration_ms < 0:
        raise ValueError('Measurement requires a valid request duration')
    if m['bodyTpsState'] not in ('measured','request_incomplete','unknown_tokens','unknown_first_chunk','insufficient_sample'):
        raise ValueError('Invalid rate availability state')
    if m['firstChunkTokens'] is not None and (m['visibleTokens'] is None or m['firstChunkTokens'] > m['visibleTokens']):
        raise ValueError('First chunk exceeds total visible tokens')
    if m['firstChunkTokens'] is not None and m['chunkCount'] == 0:
        raise ValueError('First-chunk count requires a visible chunk')
    if (m['chunkCount'] < 2) != (m['sampleSeconds'] is None):
        raise ValueError('Sample interval contradicts chunk count')
    if status != 'success' and any(m[k] is not None for k in ('bodyTps','endToEndTps','charsPerSec','chunkGapP50Ms','chunkGapP95Ms')):
        raise ValueError('Incomplete requests cannot claim successful rates')
    if m['sampleSeconds'] is not None and (duration_ms is None or m['sampleSeconds'] > duration_ms/1000+.001):
        raise ValueError('Rate sample exceeds request duration')
    enough = m['chunkCount'] >= 3 and m['sampleSeconds'] is not None and m['sampleSeconds'] >= .5
    expected_state = ('request_incomplete' if status != 'success' else 'unknown_tokens' if m['visibleTokens'] is None
                      else 'unknown_first_chunk' if m['firstChunkTokens'] is None
                      else 'insufficient_sample' if not enough or m['visibleTokens'] - m['firstChunkTokens'] < 64 else 'measured')
    if m['bodyTpsState'] != expected_state:
        raise ValueError('Rate availability contradicts evidence')
    if m['charsPerSec'] is not None and (not enough or m['charsPerSec'] * m['sampleSeconds'] < 64 - .001):
        raise ValueError('Character rate lacks sufficient sample')
    for key in ('chunkGapP50Ms', 'chunkGapP95Ms'):
        expected_gap = status == 'success' and m['chunkCount'] >= 2
        if (m[key] is not None) != expected_gap or (m[key] is not None and m[key] > m['sampleSeconds'] * 1000 + .01):
            raise ValueError('Chunk gap contradicts sample')
    if m['chunkGapP50Ms'] is not None and m['chunkGapP50Ms'] > m['chunkGapP95Ms']:
        raise ValueError('Chunk gap quantiles are reversed')
    if m['bodyTpsState'] == 'measured':
        n, first, span = m['visibleTokens'],m['firstChunkTokens'],m['sampleSeconds']
        if status!='success' or n is None or first is None or n-first<64 or m['chunkCount']<3 or span is None or span<.5 or m['bodyTps'] is None or not math.isclose(m['bodyTps'],(n-first)/span,rel_tol=1e-4,abs_tol=.01):
            raise ValueError('Body TPS lacks sufficient matching evidence')
    elif m['bodyTps'] is not None:
        raise ValueError('Unavailable rate must remain null')
    if m['endToEndTps'] is not None and (duration_ms is None or duration_ms<=0 or m['visibleTokens'] is None or not math.isclose(m['endToEndTps'],m['visibleTokens']/(duration_ms/1000),rel_tol=1e-3,abs_tol=.01)):
        raise ValueError('End-to-end rate contradicts duration/usage')
    if (m['endToEndTps'] is not None) != (status == 'success' and m['visibleTokens'] is not None and duration_ms > 0):
        raise ValueError('End-to-end availability contradicts duration/usage')
