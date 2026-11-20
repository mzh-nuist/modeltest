"""Render the original two-phrase bell study supplied to all entries."""
from array import array
import json
import math
from pathlib import Path
import sys
import wave

root = Path(__file__).with_name('frontend')
rate = 24000
duration = 19
buffer = [0.0] * (rate * duration)
beats = [0.4 + 0.66 * i for i in range(12)] + [8.4 + 0.48 * i for i in range(18)]
tune = [72,76,79,81,79,76,74,72,71,74,77,79,
        84,79,81,76,79,76,74,77,79,83,86,83,84,79,76,74,72,72]
bells = []


def note(start, pitch, gain, length, bell=False):
    frequency = 440 * 2 ** ((pitch - 69) / 12)
    offset = round(start * rate)
    for i in range(min(round(length * rate), len(buffer) - offset)):
        time = i / rate
        decay = math.exp(-time * (5.3 if bell else 3.8))
        envelope = min(time * 115, 1, (length - time) * 18) * decay
        phase = math.tau * frequency * time
        tone = math.sin(phase) + 0.37 * math.sin(phase * (2.76 if bell else 2)) + 0.18 * math.sin(phase * 4.02)
        buffer[offset + i] += gain * envelope * tone


for i, (position, melody) in enumerate(zip(beats, tune, strict=True)):
    step = 0.66 if i < 12 else 0.48
    note(position, melody, 0.28, 0.65, bell=True)
    note(position, (48 if i % 8 < 4 else 43) + (0 if i % 4 == 0 else 12), 0.22, 0.56)
    if i % 4 in (1, 3):
        bells.append(round(position + 0.5 * step, 3))
        note(bells[-1], melody + 12, 0.23, 0.75, bell=True)

for pitch in (48, 60, 67, 72, 76):
    note(17.35, pitch, 0.12, 1.6, bell=True)

peak = max(abs(value) for value in buffer)
pcm = array('h', (round(value * 28500 / peak) for value in buffer))
if sys.byteorder != 'little':
    pcm.byteswap()
with wave.open(str(root / 'music.wav'), 'wb') as output:
    output.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
    output.writeframes(pcm.tobytes())

sheet = {'duration':duration, 'beats':[round(beat,3) for beat in beats],
         'accents':[round(beat,3) for i,beat in enumerate(beats) if i % 4 == 0],
         'bells':bells, 'sections':{'opening':0,'faster':8.4,'ending':17.35}}
(root / 'cue-sheet.json').write_text(json.dumps(sheet, indent=2) + '\n', encoding='utf-8')
