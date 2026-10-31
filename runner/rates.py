"""Conservative client-side rate eligibility. Not an internal decode measurement."""
RATE_POLICY = 'client-sse-v2-min500ms-3chunks-64units'


def estimate_rates(status, chunks, visible_tokens):
    """chunks is [(elapsed_seconds, visible_text), ...], with empty chunks removed.

    Require >=500ms, >=3 chunks and >=64 visible tokens/code points. These are
    published sampling rules, not evidence that buffering has been eliminated.
    """
    seconds = chunks[-1][0] - chunks[0][0] if len(chunks) >= 2 else None
    enough = status == 'success' and len(chunks) >= 3 and seconds is not None and seconds >= .5
    chars_after_first = sum(len(text) for _, text in chunks[1:])
    tps = visible_tokens / seconds if enough and visible_tokens is not None and visible_tokens >= 64 else None
    cps = chars_after_first / seconds if enough and chars_after_first >= 64 else None
    return {'outputTps': round(tps, 3) if tps is not None else None,
            'charsPerSec': round(cps, 3) if cps is not None else None,
            'ratePolicy': RATE_POLICY, 'rateSampleSeconds': seconds,
            'answerChunkCount': len(chunks)}
