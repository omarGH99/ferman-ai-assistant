// Native fallback. Expo Go has no built-in speech-to-text (it needs a custom dev
// build with a native STT module), so voice input is web-only for now and the
// mic button simply doesn't render on native.
export function useVoiceInput(_lang: string, _onResult: (text: string) => void) {
  return {
    supported: false,
    listening: false,
    start: () => {},
    stop: () => {},
  };
}
