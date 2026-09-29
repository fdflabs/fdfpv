# build.py: speaks every line of assets/audio/war/lines.json in English
# and Spanish, through the radio, into the war audio folder.
#
# Usage, from tools/voice:
#   CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=1 \
#     ~/.local/bin/uv run python build.py [--out DIR] [--only ID ...]
#
# How a line is made:
#   1. Kokoro 82M (Apache 2.0) reads the voice block's reference text once
#      per language in its stock voice. That clip is the commander's voice,
#      and it is synthetic, so no real person's voice is cloned.
#   2. Chatterbox Multilingual (MIT) speaks the line in that voice, with
#      the delivery's exaggeration, from a seed derived from the line's id,
#      language and attempt number.
#   3. Whisper large v3 turbo (MIT) transcribes the take. A take is thrown
#      away (script.judge) if any content word of the line is missing
#      from the transcript, case and accents folded, if its word error rate
#      is over MAX_WER, or if Whisper heard any word the script does not have
#      (Chatterbox's failure is a babbled tail, and an insertion is how
#      that reads). The next attempt runs, and a line with no good take in
#      ATTEMPTS fails the build, loudly, and its old take is removed. A
#      line whose correct reading Whisper spells differently lists that
#      spelling in `heard`; a homophone of a different word is rephrased
#      instead, because a listener cannot tell them apart either.
#   4. radio.py puts it through the radio; ffmpeg writes Opus in WebM and
#      an mp3 fallback, bit exact, as scripts/music.js does for the crate.
#
# Determinism: Kokoro (seeded), the radio and the encode are
# deterministic. The Chatterbox take is sampled; with a fixed seed two
# separate builds on one RTX 3060 Ti, torch 2.6.0 and driver gave bit
# identical samples and encoded files, but
# CUDA does not promise the same samples on a different GPU or torch
# build. The manifest records every file's sha256 so a rebuild shows what
# moved. Every Chatterbox file carries Resemble AI's Perth watermark,
# which the package always applies; it is inaudible by design.
#
# This file is part of WebFPVSimulator.
#
# WebFPVSimulator is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at
# your option) any later version.
#
# WebFPVSimulator is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY, without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.

import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from huggingface_hub import snapshot_download

import radio
import script

# Model revisions, pinned: a new revision is a new take of every line.
KOKORO = ('hexgrad/Kokoro-82M', 'f3ff3571791e39611d31c381e3a41a3af07b4987')
CHATTERBOX = ('ResembleAI/chatterbox', '5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18')
WHISPER = ('openai/whisper-large-v3-turbo', '41f01f3fe87f28c78e2fbf8b568835947dd65ed9')
CHATTERBOX_FILES = ['ve.pt', 't3_mtl23ls_v2.safetensors', 's3gen.pt',
                    'grapheme_mtl_merged_expanded_v1.json', 'conds.pt', 'Cangjie5_TC.json']

# lines.json g2p name to Kokoro's pipeline code, and the espeak language
# that replaces Kokoro's default for it. Kokoro's Spanish is espeak 'es',
# which is Castilian (cazas as ka-theta-as); the glossary asks for neutral
# Latin American Spanish, which is espeak 'es-419'.
G2P = {'en-us': ('a', None), 'es-419': ('e', 'es-419')}

SR = 24000               # Kokoro and Chatterbox both speak at 24 kHz
ATTEMPTS = 8
THREADS = 4              # the host runs other jobs; see the pull request
OPUS_KBPS = 32
LAME_Q = 7
BITEXACT = ['-fflags', '+bitexact', '-flags:a', '+bitexact']


def seed_for(line_id, lang, attempt):
    h = hashlib.sha256(f'{line_id}:{lang}:{attempt}'.encode()).digest()
    return int.from_bytes(h[:4], 'little')


def encode(wav_path, out_base):
    common = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+bitexact',
              '-i', str(wav_path), '-map_metadata', '-1', '-ac', '1']
    subprocess.run(common + ['-ar', '48000', '-c:a', 'libopus', '-b:a', f'{OPUS_KBPS}k',
                             '-vbr', 'on', '-compression_level', '10', '-application', 'voip',
                             *BITEXACT, f'{out_base}.webm'], check=True)
    subprocess.run(common + ['-ar', str(SR), '-c:a', 'libmp3lame', '-q:a', str(LAME_Q),
                             '-write_xing', '1', *BITEXACT, f'{out_base}.mp3'], check=True)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load_models(device):
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    from kokoro import KModel, KPipeline
    from misaki import espeak
    from transformers import pipeline

    kdir = Path(snapshot_download(KOKORO[0], revision=KOKORO[1]))
    kmodel = KModel(repo_id=KOKORO[0], config=str(kdir / 'config.json'),
                    model=str(kdir / 'kokoro-v1_0.pth')).to(device).eval()

    def kokoro(g2p):
        code, espeak_lang = G2P[g2p]
        p = KPipeline(lang_code=code, repo_id=KOKORO[0], model=kmodel, device=device)
        if espeak_lang:
            p.g2p = espeak.EspeakG2P(language=espeak_lang)
        return p

    cdir = snapshot_download(CHATTERBOX[0], revision=CHATTERBOX[1], allow_patterns=CHATTERBOX_FILES)
    tts = ChatterboxMultilingualTTS.from_local(cdir, device)
    wdir = snapshot_download(WHISPER[0], revision=WHISPER[1])
    asr = pipeline('automatic-speech-recognition', model=wdir, device=device,
                   dtype=torch.float16 if device == 'cuda' else torch.float32)
    return kdir, kokoro, tts, asr


def reference(kdir, kokoro, voice, path):
    """The commander's voice for one language, spoken by Kokoro."""
    p = kokoro(voice['g2p'])
    # Kokoro's vocoder draws noise for its harmonic source: unseeded, every
    # build had a different reference clip and so a different voice.
    torch.manual_seed(0)
    audio = np.concatenate([r.audio.numpy() for r in
                            p(voice['reference'], voice=str(kdir / 'voices' / f'{voice["kokoro"]}.pt'))])
    sf.write(path, audio, SR)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, default=script.DEFAULT_OUT)
    ap.add_argument('--only', nargs='*', help='line ids to rebuild; the rest of the manifest is kept')
    ap.add_argument('--device', default='cuda')
    args = ap.parse_args()

    doc = script.load()
    todo = [l for l in doc['lines'] if not args.only or l['id'] in args.only]
    unknown = set(args.only or []) - {l['id'] for l in doc['lines']}
    if unknown:
        sys.exit(f'build: no line with id {", ".join(sorted(unknown))}')

    torch.set_num_threads(THREADS)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

    out = args.out
    work = out / '_work'
    work.mkdir(parents=True, exist_ok=True)
    manifest_path = out / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    manifest.setdefault('voice', {})
    manifest['models'] = {'kokoro': list(KOKORO), 'chatterbox': list(CHATTERBOX), 'whisper': list(WHISPER),
                          'torch': torch.__version__}

    t0 = time.time()
    kdir, kokoro, tts, asr = load_models(args.device)
    fails = []
    for lang in script.LANGS:
        ref = work / f'reference-{lang}.wav'
        reference(kdir, kokoro, doc['voice'][lang], ref)
        tts.prepare_conditionals(str(ref))
        (out / 'voice' / lang).mkdir(parents=True, exist_ok=True)
        for line in todo:
            text = line[lang]
            readings = [text, *line.get('heard', {}).get(lang, [])]
            d = doc['delivery'][line['delivery']]
            takes = []
            for attempt in range(ATTEMPTS):
                seed = seed_for(line['id'], lang, attempt)
                torch.manual_seed(seed)
                take = tts.generate(text, language_id=lang, exaggeration=d['exaggeration'],
                                    cfg_weight=d['cfg_weight']).squeeze(0).numpy()
                heard = asr({'raw': take.copy(), 'sampling_rate': SR},
                            generate_kwargs={'language': lang, 'task': 'transcribe'})['text'].strip()
                v = script.judge(readings, heard, lang)
                takes.append({'attempt': attempt, 'seed': seed, 'heard': heard,
                              'wer': v['wer'], 'extra': v['extra'], 'missing': v['missing']})
                if v['ok']:
                    break
            else:
                fails.append(f'{line["id"]}.{lang}: no good take in {ATTEMPTS}: ' +
                             '; '.join(f'{t["heard"]!r} (wer {t["wer"]}, missing {t["missing"]})' for t in takes))
                print(f'FAIL {line["id"]:14s} {lang} | ' +
                      ' / '.join(f'{t["heard"]} {t["missing"]}' for t in takes), flush=True)
                # A take from an earlier, looser build must not stay behind
                # looking valid: drop it, so voice:check fails until fixed.
                manifest['voice'].pop(f'{line["id"]}.{lang}', None)
                for fmt in script.FORMATS:
                    (out / 'voice' / lang / f'{line["id"]}.{fmt}').unlink(missing_ok=True)
                continue
            wav = work / f'{line["id"]}-{lang}.wav'
            y = radio.radio(take, SR, seed)
            sf.write(wav, y, SR, subtype='FLOAT')
            base = out / 'voice' / lang / line['id']
            encode(wav, base)
            files = {fmt: {'bytes': Path(f'{base}.{fmt}').stat().st_size, 'sha256': sha256(f'{base}.{fmt}')}
                     for fmt in script.FORMATS}
            manifest['voice'][f'{line["id"]}.{lang}'] = {
                'text': text, 'seconds': round(len(y) / SR, 3), 'takes': takes, 'files': files}
            print(f'ok   {line["id"]:14s} {lang} try {len(takes)} wer {takes[-1]["wer"]:.2f} '
                  f'{len(y) / SR:4.1f}s | {takes[-1]["heard"]}', flush=True)

    manifest['voice'] = dict(sorted(manifest['voice'].items()))
    manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'build: {len(todo)} lines x {len(script.LANGS)} languages in {time.time() - t0:.0f} s, '
          f'{len(fails)} failed')
    if fails:
        sys.exit('build: failed lines:\n  ' + '\n  '.join(fails))


if __name__ == '__main__':
    main()
