#!/usr/bin/env python3
"""
Synthesize the "Momentum" background bed (Option B) for the LinkedIn spot.

100% license-free — generated from scratch (no sampled/licensed material), pure stdlib.
Minimal-tech: ~115 BPM, arpeggiated synth + kick/sub pulse + soft hats + warm pad,
with a gentle layer build over the first ~9s. Fade-in/out is applied in Remotion
(see BgAudio in src/CleanCoreVideo.tsx), so this renders full-volume.

Usage:
    python scripts/synth-momentum.py        # writes public/audio/bg.wav
    # then: ffmpeg -i public/audio/bg.wav -c:a libmp3lame -b:a 192k public/audio/bg.mp3
"""
import math, random, wave, struct, os

SR = 44100
DUR = 40.0
N = int(SR * DUR)
BPM = 115.0
beat = 60.0 / BPM
six = beat / 4.0
buf = [0.0] * N


def add(start, dur, fn):
    s = int(start * SR)
    e = min(N, s + int(dur * SR))
    for i in range(s, e):
        buf[i] += fn((i - s) / SR)


def ramp(t, a, b):
    return 0.0 if t <= a else (1.0 if t >= b else (t - a) / (b - a))


notes = {'A2': 110.00, 'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'G3': 196.00,
         'A3': 220.00, 'B3': 246.94, 'C4': 261.63, 'E4': 329.63}
pat = ['A2', 'E3', 'A3', 'C4', 'E3', 'A3', 'C4', 'E4', 'A2', 'E3', 'A3', 'C4', 'B3', 'G3', 'E3', 'D3']

# arpeggio (16th notes)
k = 0; tpos = 0.0
while tpos < DUR:
    f = notes[pat[k % len(pat)]]; g = 0.32 * ramp(tpos, 2, 5)
    if g > 0:
        add(tpos, 0.14, (lambda f, g: lambda x: g * math.exp(-x / 0.09) *
            (math.sin(2 * math.pi * f * x) + 0.35 * math.sin(4 * math.pi * f * x)) *
            (1 - math.exp(-x / 0.004)))(f, g))
    tpos += six; k += 1

# kick + sub on every beat
tpos = 0.0
while tpos < DUR:
    gk = 0.9 * ramp(tpos, 4, 6); gs = 0.34 * ramp(tpos, 4, 6)
    if gk > 0:
        add(tpos, 0.22, lambda x, g=gk: g * math.exp(-x / 0.05) *
            math.sin(2 * math.pi * (45 + 55 * math.exp(-x / 0.03)) * x))
    if gs > 0:
        add(tpos, 0.30, lambda x, g=gs: g * math.exp(-x / 0.14) *
            (1 - math.exp(-x / 0.006)) * math.sin(2 * math.pi * 55 * x))
    tpos += beat

# hats on the offbeat
random.seed(7); tpos = beat / 2.0
while tpos < DUR:
    gh = 0.09 * ramp(tpos, 6, 9)
    if gh > 0:
        add(tpos, 0.035, lambda x, g=gh: g * math.exp(-x / 0.010) * (random.random() * 2 - 1))
    tpos += beat

# warm pad (continuous chord)
pf = [110.0, 164.81, 220.0]
for i in range(N):
    x = i / SR; gp = 0.06 * ramp(x, 0, 3)
    if gp > 0:
        trem = 0.85 + 0.15 * math.sin(2 * math.pi * 0.15 * x)
        buf[i] += gp * trem * (math.sin(2 * math.pi * pf[0] * x) +
                               math.sin(2 * math.pi * pf[1] * x) +
                               0.7 * math.sin(2 * math.pi * pf[2] * x))

peak = max(1e-6, max(abs(v) for v in buf)); sc = 0.89 / peak
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'audio', 'bg.wav')
os.makedirs(os.path.dirname(out), exist_ok=True)
w = wave.open(out, 'w'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
frames = bytearray()
for v in buf:
    y = math.tanh(v * sc * 1.1)
    frames += struct.pack('<h', int(max(-1, min(1, y)) * 32767))
w.writeframes(bytes(frames)); w.close()
print('wrote', out)
