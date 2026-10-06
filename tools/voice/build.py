# build.py: speaks every line of assets/audio/war/lines.json in English
# and Spanish, through the radio, into the war audio folder.
#
# Usage, from tools/voice:
#   CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=1 \
#     ~/.local/bin/uv run python build.py [--out DIR] [--only ID ...] [--takes N]
#
# How a line is made:
#   1. Kokoro 82M (Apache 2.0) reads its speaker's reference text (lines.json
#      voices, docs/campaign/BIBLE.md 5.2) once per language in that
#      speaker's stock voice. That clip is the speaker's voice, and it is
#      synthetic, so no real person's voice is cloned.
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
#   4. radio.py puts it through its speaker's radio; ffmpeg writes Opus in
#      WebM and an mp3 fallback, bit exact, as scripts/music.js does for
#      the crate.
#
# Takes (docs/campaign/TECH-NEEDS.md T3.2): the first take that passes is
# the line, unless lines.json pins one (a line's `take`, its seed per
# language), which is then the only one tried. With --takes N, N passing
# takes of each line are written to the review folder (_review/<lang>/<id>/
# <seed>.webm) for a person to listen to and pin; the line is still the
# pinned or the first one.
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
# This file is part of the Paraguayan Drone Combat Simulator.
#
# The Paraguayan Drone Combat Simulator is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at
# your option) any later version.
#
# The Paraguayan Drone Combat Simulator is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY, without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with the Paraguayan Drone Combat Simulator. If not, see <https://www.gnu.org/licenses/>.

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
G2P = {'en-us': ('a', None), 'en-gb': ('b', None), 'es-419': ('e', 'es-419')}

SR = 24000               # Kokoro and Chatterbox both speak at 24 kHz
ATTEMPTS = 8
THREADS = 4              # the host runs other jobs; see the pull request
OPUS_KBPS = 32
LAME_Q = 7
BITEXACT = ['-fflags', '+bitexact', '-flags:a', '+bitexact']
# A take's sound after its last word (tail_ms): frames louder than this
# under its peak, from this long after the word's end.
TAIL_DB = -35.0
TAIL_GRACE_S = 0.3


# Chatterbox's alignment analyzer (chatterbox/models/t3/inference/
# alignment_stream_analyzer.py, step) slices off a text's last five tokens,
# start and stop included; on a text of five or fewer ("No.", "There.") the
# slice is empty and max() raises IndexError, killing the build.
ANALYZER_TAIL = 5


def chatterbox_text(text, lang, tokenizer):
    """The text Chatterbox is handed for a line: the line's own, or, when
    it is too short for the alignment analyzer (ANALYZER_TAIL), the same
    with its stop spaced off ("No ."), one token longer and read the same.
    The line's text, its subtitle and the gate's reading are unchanged, and
    a line long enough is never touched, so no existing take moves."""
    from chatterbox.mtl_tts import punc_norm
    n = tokenizer.text_to_tokens(punc_norm(text), language_id=lang).shape[-1] + 2
    return text if n > ANALYZER_TAIL else f'{text[:-1]} {text[-1]}'


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


def words_end(chunks):
    """Where Whisper put the end of the last word, seconds, or None."""
    ends = [c['timestamp'][1] for c in chunks if c.get('timestamp') and c['timestamp'][1] is not None]
    return max(ends) if ends else None


def tail_ms(take, chunks):
    """How much sound a take has after its last word as Whisper placed it,
    ms: Chatterbox's other failure is a mumble after the line, which Whisper
    leaves out of its transcript, so the words pass and the file runs on
    (bearing-n's first build: two seconds of it). Counted on 10 ms frames
    louder than TAIL_DB under the take's peak, from TAIL_GRACE_S after the
    last word's end."""
    end = words_end(chunks)
    if end is None:
        return 0
    x = np.asarray(take, dtype=np.float64)
    hop = int(SR * 0.01)
    start = int((end + TAIL_GRACE_S) * SR)
    rest = x[start: start + (len(x) - start) // hop * hop]
    if len(rest) < hop:
        return 0
    frames = rest.reshape(-1, hop)
    rms = np.sqrt(np.mean(frames * frames, axis=1) + 1e-20)
    loud = 20 * np.log10(rms / (np.max(np.abs(x)) + 1e-20)) > TAIL_DB
    return int(np.count_nonzero(loud) * 10)


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
    # Word timings need every attention map back, which does not fit beside
    # the speech models on an 8 GB card: the same Whisper, on the CPU.
    timer = pipeline('automatic-speech-recognition', model=wdir, device='cpu', dtype=torch.float32)

    def words(take, lang):
        return timer({'raw': take.copy(), 'sampling_rate': SR}, return_timestamps='word',
                     generate_kwargs={'language': lang, 'task': 'transcribe'})
    return kdir, kokoro, tts, asr, words


def reference(kdir, kokoro, voice, path):
    """A speaker's voice for one language, spoken by Kokoro."""
    p = kokoro(voice['g2p'])
    # Kokoro's vocoder draws noise for its harmonic source: unseeded, every
    # build had a different reference clip and so a different voice.
    torch.manual_seed(0)
    audio = np.concatenate([r.audio.numpy() for r in
                            p(voice['reference'], voice=str(kdir / 'voices' / f'{voice["kokoro"]}.pt'))])
    sf.write(path, audio, SR)


def speak(line, lang, tts, asr, words, doc, preset, out, work, review, want, manifest):
    """One line in one language: its takes, the line's file and manifest
    entry, and the review folder's takes. Returns a fault, or None."""
    text = line[lang]
    readings = [text, *line.get('heard', {}).get(lang, [])]
    d = doc['delivery'][line['delivery']]
    pinned = (line.get('take') or {}).get(lang)
    seeds = [pinned] if pinned is not None else [seed_for(line['id'], lang, a) for a in range(ATTEMPTS * max(1, want))]
    takes = []
    passing = []
    for attempt, seed in enumerate(seeds):
        torch.manual_seed(seed)
        take = tts.generate(chatterbox_text(text, lang, tts.tokenizer), language_id=lang, exaggeration=d['exaggeration'],
                            cfg_weight=d['cfg_weight']).squeeze(0).numpy()
        heard = asr({'raw': take.copy(), 'sampling_rate': SR},
                    generate_kwargs={'language': lang, 'task': 'transcribe'})['text'].strip()
        v = script.judge(readings, heard, lang)
        # Word timings only for a take whose words pass: they are what the
        # tail is measured from, and they cost a second transcription.
        chunks = []
        if v['ok']:
            chunks = words(take, lang)['chunks'] or []
        tail = tail_ms(take, chunks)
        takes.append({'attempt': attempt, 'seed': seed, 'heard': heard,
                      'wer': v['wer'], 'extra': v['extra'], 'missing': v['missing'], 'tail_ms': tail})
        if v['ok'] and tail <= script.MAX_TAIL_MS:
            # The quiet after the last word goes too: it is dead air the
            # line's length (and a film's shot) would otherwise carry.
            end = words_end(chunks)
            if end is not None:
                take = take[: int((end + TAIL_GRACE_S) * SR)]
            passing.append((seed, take, takes[-1]))
            if len(passing) >= want:
                break
    if not passing:
        why = 'its pinned take fails' if pinned is not None else f'no good take in {len(seeds)}'
        print(f'FAIL {line["id"]:14s} {lang} | ' +
              ' / '.join(f'{t["heard"]} {t["missing"]}' for t in takes), flush=True)
        # A take from an earlier, looser build must not stay behind
        # looking valid: drop it, so voice:check fails until fixed.
        manifest['voice'].pop(f'{line["id"]}.{lang}', None)
        for fmt in script.FORMATS:
            (out / 'voice' / lang / f'{line["id"]}.{fmt}').unlink(missing_ok=True)
        return (f'{line["id"]}.{lang}: {why}: ' +
                '; '.join(f'{t["heard"]!r} (wer {t["wer"]}, missing {t["missing"]})' for t in takes))
    if want > 1:
        folder = review / lang / line['id']
        folder.mkdir(parents=True, exist_ok=True)
        for seed, take, t in passing:
            wav = work / f'review-{line["id"]}-{lang}-{seed}.wav'
            sf.write(wav, radio.radio(take, SR, seed, preset), SR, subtype='FLOAT')
            encode(wav, folder / str(seed))
            (folder / f'{seed}.txt').write_text(f'{t["heard"]}\nwer {t["wer"]}\n', encoding='utf-8')
    seed, take, chosen = passing[0]
    # The line's record ends with the take it is: the pinned check reads
    # the last take's seed.
    kept = [t for t in takes if t is not chosen] + [chosen]
    wav = work / f'{line["id"]}-{lang}.wav'
    y = radio.radio(take, SR, seed, preset)
    sf.write(wav, y, SR, subtype='FLOAT')
    base = out / 'voice' / lang / line['id']
    encode(wav, base)
    files = {fmt: {'bytes': Path(f'{base}.{fmt}').stat().st_size, 'sha256': sha256(f'{base}.{fmt}')}
             for fmt in script.FORMATS}
    manifest['voice'][f'{line["id"]}.{lang}'] = {
        'text': text, 'speaker': line['speaker'], 'seconds': round(len(y) / SR, 3), 'takes': kept, 'files': files}
    print(f'ok   {line["id"]:14s} {lang} {line["speaker"]:8s} try {len(takes)} wer {chosen["wer"]:.2f} '
          f'{len(y) / SR:4.1f}s | {chosen["heard"]}', flush=True)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=Path, default=script.DEFAULT_OUT)
    ap.add_argument('--only', nargs='*', help='line ids to rebuild; the rest of the manifest is kept')
    ap.add_argument('--device', default='cuda')
    ap.add_argument('--takes', type=int, default=1, help='passing takes a line to write for review')
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
    kdir, kokoro, tts, asr, words = load_models(args.device)
    fails = []
    review = out / '_review'
    for lang in script.LANGS:
        (out / 'voice' / lang).mkdir(parents=True, exist_ok=True)
        for speaker, voice in doc['voices'].items():
            lines = [l for l in todo if l['speaker'] == speaker]
            if not lines:
                continue
            ref = work / f'reference-{speaker}-{lang}.wav'
            reference(kdir, kokoro, voice[lang], ref)
            tts.prepare_conditionals(str(ref))
            preset = voice.get('preset', speaker)
            for line in lines:
                fail = speak(line, lang, tts, asr, words, doc, preset, out, work, review, args.takes, manifest)
                if fail:
                    fails.append(fail)

    manifest['voice'] = dict(sorted(manifest['voice'].items()))
    manifest_path.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'build: {len(todo)} lines x {len(script.LANGS)} languages in {time.time() - t0:.0f} s, '
          f'{len(fails)} failed')
    if fails:
        sys.exit('build: failed lines:\n  ' + '\n  '.join(fails))


if __name__ == '__main__':
    main()
