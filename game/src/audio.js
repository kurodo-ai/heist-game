// All sound is synthesised with WebAudio: no audio files, no network. The context is created
// on the first user gesture (a key or a click), so the browser's autoplay rules are satisfied
// and the title screen stays silent until the player starts.
export function createAudio() {
  let context = null;
  let master = null;
  let alarmNodes = null;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.16;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, when, slideTo) {
    if (context === null) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, context.currentTime + when);
    if (slideTo !== undefined) oscillator.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + when + dur);
    gain.gain.setValueAtTime(0.0001, context.currentTime + when);
    gain.gain.exponentialRampToValueAtTime(0.9, context.currentTime + when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + when + dur);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(context.currentTime + when);
    oscillator.stop(context.currentTime + when + dur + 0.05);
  }

  /** A soft two-note chime when loot is pocketed. */
  function pickup() {
    if (!ensure()) return;
    tone(880, 0.12, 'sine', 0);
    tone(1318, 0.18, 'sine', 0.07);
  }

  /** A low dissonant sting the first frame a cone finds the thief. */
  function spotted() {
    if (!ensure()) return;
    tone(196, 0.35, 'sawtooth', 0, 130);
    tone(207, 0.35, 'sawtooth', 0, 138);
  }

  /** A puff of air when a smoke bomb pops. */
  function smoke() {
    if (!ensure()) return;
    tone(320, 0.4, 'sine', 0, 90);
  }

  /** A short descending sting when the heist ends badly. */
  function caught() {
    if (!ensure()) return;
    tone(392, 0.25, 'triangle', 0, 311);
    tone(311, 0.3, 'triangle', 0.2, 233);
    tone(233, 0.5, 'triangle', 0.45, 116);
  }

  /** A rising arpeggio when the thief slips out with the loot. */
  function escaped() {
    if (!ensure()) return;
    tone(523, 0.16, 'triangle', 0);
    tone(659, 0.16, 'triangle', 0.12);
    tone(784, 0.16, 'triangle', 0.24);
    tone(1046, 0.4, 'triangle', 0.36);
  }

  /** The alarm siren while the heat is high: a slow two-tone wail, started and stopped once. */
  function setAlarm(on) {
    if (on) {
      if (alarmNodes !== null) return;
      if (!ensure()) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const lfo = context.createOscillator();
      const lfoGain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 660;
      lfo.type = 'sine';
      lfo.frequency.value = 0.7;
      lfoGain.gain.value = 180;
      gain.gain.value = 0.12;
      lfo.connect(lfoGain);
      lfoGain.connect(oscillator.frequency);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start();
      lfo.start();
      alarmNodes = { oscillator, lfo, gain };
    } else if (alarmNodes !== null) {
      try {
        alarmNodes.gain.gain.setTargetAtTime(0.0001, context.currentTime, 0.05);
        alarmNodes.oscillator.stop(context.currentTime + 0.3);
        alarmNodes.lfo.stop(context.currentTime + 0.3);
      } catch {
        // Already stopped: nothing to silence.
      }
      alarmNodes = null;
    }
  }

  /** Wake the context from a gesture; safe to call on every key or click. */
  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume();
  }

  return { unlock, pickup, spotted, smoke, caught, escaped, setAlarm };
}
