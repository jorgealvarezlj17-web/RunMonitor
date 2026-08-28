class SoundEffects {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Activa la vibración del dispositivo si está soportada
  private vibrate(pattern: number | number[]) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        console.warn('Vibration API not supported or blocked', e);
      }
    }
  }

  // Crea un "tick" o "pop" muy limpio y profesional (estilo iOS / UI moderna)
  private playTactileClick(startFreq: number, endFreq: number, duration: number, vol: number) {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    
    osc.start(t);
    osc.stop(t + duration);
  }

  playPowerOn() {
    // Clic moderno, sutil y agudo + Vibración más fuerte
    this.playTactileClick(1200, 200, 0.015, 1.0);
    this.vibrate(50); // Aumentado a 50ms para que el motor tenga tiempo de arrancar
  }

  playPowerOff() {
    // Clic moderno, sutil y un poco más grave + Vibración más fuerte
    this.playTactileClick(800, 100, 0.015, 1.0);
    this.vibrate(40); // Aumentado a 40ms
  }

  playDisable() {
    // Clic muy suave, corto y grave + Doble vibración notoria
    this.playTactileClick(400, 50, 0.02, 1.0);
    this.vibrate([50, 50, 50]); // Patrón más largo y notorio
  }

  playEnable() {
    // Clic claro y definido + Vibración firme
    this.playTactileClick(1000, 150, 0.015, 1.0);
    this.vibrate(60); // Aumentado a 60ms
  }
}

export const sounds = new SoundEffects();
