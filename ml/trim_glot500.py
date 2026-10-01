"""Shrink Glot500 to the four languages Ferman actually serves.

Why this exists
---------------
Glot500 tokenises Kurdish far better than XLM-R -- 1.77 subwords per Sorani
word against 3.31, measured on the held-out split -- which is the single
clearest explanation for Kurdish sitting at 0.70 accuracy while English sits at
0.89. The model almost never sees a Kurdish word as a unit.

The cost is a 401k-token vocabulary covering 500+ languages, which makes the
model 393M parameters against XLM-R's 277M. We need four languages. Dropping
the embedding rows for the other 496 makes it *smaller* than what we run today:

    XLM-R today                250,002 tokens    277M params   1.11 GB
    Glot500 full               401,145           393M          1.57 GB
    Glot500 trimmed (this)     179,371           223M          0.89 GB

Run this BEFORE fine-tuning, then train the intent and slot heads on the
trimmed base exactly as the existing notebooks do.

What is kept
------------
Not just the tokens our dataset happens to contain -- that is 11,678 pieces,
and the first tester to type an unseen word would hit <unk>. We keep every
piece whose characters fall inside the scripts we serve (ASCII/Latin plus the
Arabic ranges that Sorani, Badini and Arabic all draw on). That is a much
looser filter, and it still drops 55% of the vocabulary.

Usage
-----
    python ml/trim_glot500.py --out ./glot500-ferman
    # then push to the Hub and point the training notebooks at it
"""
import argparse
import os

import torch
from transformers import AutoModel, AutoTokenizer

SRC = "cis-lmu/glot500-base"

# Arabic-script ranges: base Arabic + Supplement (Sorani/Badini extras) +
# Extended-A, and the presentation forms some sources normalise into.
_ARABIC = [("؀", "ۿ"), ("ݐ", "ݿ"), ("ࢠ", "ࣿ"),
           ("ﭐ", "﷿"), ("ﹰ", "﻿")]

# Accented Latin. Not optional, and not obvious: the Badini rows in
# XLMR_dataset_4lang_v2.csv are Arabic-script but still contain ç, ê and û, and
# Kurmanji is routinely written in Latin script entirely. Restricting Latin to
# ASCII silently drops the pieces that spell those, which changes how the text
# segments -- caught by the segmentation check at the bottom of this file,
# which is the reason that check compares pieces rather than counting ids.
_LATIN = [(" ", "ÿ"),  # Latin-1 Supplement: ç, ê, û, î
          ("Ā", "ſ"),  # Latin Extended-A: ş, ğ
          ("ƀ", "ɏ"),  # Latin Extended-B
          ("̀", "ͯ")]  # combining diacritics


def in_scope(piece: str) -> bool:
    """True if every character is in a script we serve."""
    s = piece.replace("▁", "")  # SentencePiece word-boundary marker
    if not s:
        return True
    for ch in s:
        if ch.isascii():
            continue
        if any(lo <= ch <= hi for lo, hi in _ARABIC):
            continue
        if any(lo <= ch <= hi for lo, hi in _LATIN):
            continue
        return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="./glot500-ferman")
    ap.add_argument("--src", default=SRC)
    args = ap.parse_args()

    print(f"loading {args.src} ...")
    tok = AutoTokenizer.from_pretrained(args.src)
    model = AutoModel.from_pretrained(args.src)

    vocab = tok.get_vocab()                      # piece -> id
    inv = {i: p for p, i in vocab.items()}

    keep_ids = sorted(i for i, p in inv.items() if in_scope(p))
    keep_ids = sorted(set(keep_ids) | set(tok.all_special_ids))
    print(f"keeping {len(keep_ids):,} of {len(vocab):,} pieces "
          f"({len(keep_ids)/len(vocab):.0%})")

    # ---- new embedding matrix -------------------------------------------
    emb = model.get_input_embeddings().weight.data
    new_emb = emb[torch.tensor(keep_ids)].clone()

    # ---- rebuild the tokenizer on the kept pieces ------------------------
    # Glot500's fast tokenizer is Unigram, not BPE. That matters: the vocab is
    # an ordered list of [piece, log_prob] where the id *is* the list index, and
    # there is no merge table. So trimming is a filter that preserves order --
    # and every numeric id stored elsewhere in the JSON has to be renumbered to
    # match, or the tokenizer emits ids with no embedding row behind them.
    #
    # Three such ids exist:
    #   * unk_id, an index into this list;
    #   * the added_tokens entries (<s> <pad> </s> <unk> at 0-3, <mask> last);
    #   * nothing in the post-processor, which refers to specials by name.
    import json

    backing = json.loads(tok.backend_tokenizer.to_str())
    model_part = backing["model"]
    if model_part.get("type") != "Unigram":
        raise SystemExit(f"expected a Unigram tokenizer, got {model_part.get('type')!r}")

    old_vocab = model_part["vocab"]
    new_index = {old: new for new, old in enumerate(keep_ids)}
    model_part["vocab"] = [old_vocab[i] for i in keep_ids]

    if model_part.get("unk_id") is not None:
        model_part["unk_id"] = new_index[model_part["unk_id"]]

    for a in backing.get("added_tokens", []):
        if a["id"] not in new_index:
            raise SystemExit(f"special token {a['content']!r} was trimmed away")
        a["id"] = new_index[a["id"]]

    os.makedirs(args.out, exist_ok=True)
    new_tok_path = os.path.join(args.out, "tokenizer.json")
    with open(new_tok_path, "w", encoding="utf-8") as f:
        json.dump(backing, f, ensure_ascii=False)

    # ---- resize and save the model --------------------------------------
    model.resize_token_embeddings(len(keep_ids))
    model.get_input_embeddings().weight.data = new_emb
    model.config.vocab_size = len(keep_ids)
    model.save_pretrained(args.out)

    tot = sum(p.numel() for p in model.parameters())
    print(f"saved to {args.out}")
    print(f"parameters: {tot/1e6:.1f}M  (fp32 ~{tot*4/1e9:.2f} GB)")

    # ---- prove it survived ----------------------------------------------
    from transformers import PreTrainedTokenizerFast
    check = PreTrainedTokenizerFast(
        tokenizer_file=new_tok_path,
        unk_token=tok.unk_token, pad_token=tok.pad_token,
        cls_token=tok.cls_token, sep_token=tok.sep_token, mask_token=tok.mask_token,
    )
    check.save_pretrained(args.out)

    # The real test is not "are the ids in range" -- it is whether trimming
    # changed how text tokenises. If a dropped piece was being used, the
    # segmentation shifts and every downstream number moves with it. Comparing
    # the actual pieces against the untrimmed tokenizer catches that; comparing
    # ids alone would not, because the ids were renumbered on purpose.
    samples = [
        "remind me to call the bank tomorrow at 3pm",
        "ذكرني اتصل بالبنك غدا الساعة ثلاثة",
        "بیرم بخەرەوە سبەینێ کاتژمێر سێ پەیوەندی بە بانک بکەم",
        "هەولێر چیە",
        "bibîne min li Duhokê saet sê",
    ]
    print("\nsegmentation must be identical to the untrimmed tokenizer:")
    ok = True
    for s in samples:
        before = tok.tokenize(s)
        after = check.tokenize(s)
        same = before == after
        inrange = max(check.encode(s)) < len(keep_ids)
        ok &= same and inrange
        flag = "ok " if (same and inrange) else "BAD"
        print(f"  {flag} {len(after):>3} tok  {'identical' if same else 'CHANGED'}  {s[:40]}")
        if not same:
            print(f"      was: {before[:12]}")
            print(f"      now: {after[:12]}")
    print("\nPASS -- safe to fine-tune on" if ok else "\nFAIL -- do not train on this")


if __name__ == "__main__":
    main()
