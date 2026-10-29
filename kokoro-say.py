# kokoro-say.py <voice> <speed> <out.wav>   (text on stdin) — Kokoro-82M (Apache-2.0), runs locally, no service
import sys, soundfile as sf
from kokoro_onnx import Kokoro
import os; d = os.path.dirname(os.path.abspath(sys.argv[0])) + '/kokoro/'
k = Kokoro(d + 'kokoro-v1.0.onnx', d + 'voices-v1.0.bin')
samples, sr = k.create(sys.stdin.read().strip(), voice=sys.argv[1], speed=float(sys.argv[2]), lang='en-us')
sf.write(sys.argv[3], samples, sr)
