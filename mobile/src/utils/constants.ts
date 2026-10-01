export const LOW = 0.55; // below this: candidates row is shown expanded by default
export const CONFIRM = 0.6; // below this: ask the user instead of acting
export const OOS = 0.35; // below this: treat as out-of-scope ("didn't understand")

// Sentinel written to `corrected_intent` when the user says none of the offered
// intents fit — i.e. the command is outside what the model covers at all (the
// 26 intents dropped in v2, or anything else). Real intent ids are lowercase
// `domain_action`, so a `__` prefix can never collide with one, and it is
// obviously not a class if you read the exported CSV.
//
// Deliberately NOT a training class: see export_dataset.py. It is collected so
// the out-of-scope thresholds (INTENT_MIN_CONFIDENCE / INTENT_MIN_MARGIN) can
// be tuned against real data instead of guessed.
export const NONE_INTENT = "__none__";
