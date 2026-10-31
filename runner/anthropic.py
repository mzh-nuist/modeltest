"""Normalize documented Messages SSE events for the shared measurement loop.

Reference: https://platform.claude.com/docs/en/build-with-claude/streaming
Checked 2026-10-24. Original events remain in local raw evidence.
"""


class MessagesStream:
    def __init__(self):
        self.input_tokens = None
        self.output_tokens = None

    def normalize(self, event):
        kind = event.get('type')
        delta = {}
        finish = None
        if kind == 'error' or event.get('error'):
            raise ValueError('messages_stream_error')
        if kind == 'message_start':
            usage = event.get('message', {}).get('usage', {})
            values = [usage.get('input_tokens'), usage.get('cache_read_input_tokens', 0), usage.get('cache_creation_input_tokens', 0)]
            if all(isinstance(v, int) and not isinstance(v, bool) and v >= 0 for v in values):
                self.input_tokens = sum(values)
        elif kind == 'content_block_start':
            block = event.get('content_block', {})
            if block.get('type') in ('tool_use', 'server_tool_use', 'fallback'):
                raise ValueError('messages_non_text_task_not_supported')
            if block.get('type') == 'text' and block.get('text'):
                delta['content'] = block['text']
            elif block.get('type') == 'thinking' and block.get('thinking'):
                delta['reasoning_content'] = block['thinking']
        elif kind == 'content_block_delta':
            value = event.get('delta', {})
            if value.get('type') == 'text_delta':
                delta['content'] = value.get('text')
            elif value.get('type') == 'thinking_delta':
                delta['reasoning_content'] = value.get('thinking')
            elif value.get('type') not in ('signature_delta', 'citations_delta'):
                raise ValueError('messages_unknown_content_delta')
        elif kind == 'message_delta':
            count = event.get('usage', {}).get('output_tokens')
            if isinstance(count, int) and not isinstance(count, bool) and count >= 0:
                self.output_tokens = count  # Cumulative, never sum message_delta counters.
            reason = event.get('delta', {}).get('stop_reason')
            if reason is not None:
                finish = {'end_turn': 'stop', 'stop_sequence': 'stop', 'max_tokens': 'length', 'tool_use': 'tool_calls'}.get(reason, reason)
        elif kind not in ('ping', 'message_stop', 'content_block_stop'):
            raise ValueError('messages_unknown_event')
        normalized = {'choices': []}
        if delta or finish is not None:
            choice = {'index': 0, 'delta': delta}
            if finish is not None:
                choice['finish_reason'] = finish
            normalized['choices'] = [choice]
        if self.input_tokens is not None or self.output_tokens is not None:
            normalized['usage'] = {'prompt_tokens': self.input_tokens, 'completion_tokens': self.output_tokens}
        return normalized, kind == 'message_stop'
