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

  // Activa la vibración táctil
  private vibrate(pattern: number | number[]) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // ignore
      }
    }
  }

  // Clic suave, nítido y moderno (tipo iPhone teclado / toggle switch)
  private playSoftPop(freqStart: number, freqEnd: number, duration: number, volume: number = 0.4) {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + duration);
  }

  // Clic sutil al tocar opciones del menú o botones
  playClick() {
    this.playSoftPop(800, 160, 0.02, 0.35);
    this.vibrate(12);
  }

  // Clic claro y satisfactorio al Encender (Switch ON)
  playPowerOn() {
    this.playSoftPop(600, 1200, 0.035, 0.5);
    this.vibrate(25);
  }

  // Clic seco y satisfactorio al Apagar (Switch OFF)
  playPowerOff() {
    this.playSoftPop(900, 250, 0.035, 0.45);
    this.vibrate(20);
  }

  // Clic doble de advertencia para Falla de Corpoelec
  playFalla() {
    this.playSoftPop(450, 120, 0.04, 0.5);
    setTimeout(() => {
      this.playSoftPop(350, 90, 0.05, 0.5);
    }, 60);
    this.vibrate([40, 40, 50]);
  }

  // Clic de corte eléctrico
  playCorte() {
    this.playSoftPop(500, 100, 0.04, 0.5);
    this.vibrate([30, 30, 30]);
  }

  // Clic de confirmación para reportes
  playSuccess() {
    this.playSoftPop(700, 1400, 0.03, 0.4);
    setTimeout(() => {
      this.playSoftPop(1000, 1800, 0.04, 0.45);
    }, 70);
    this.vibrate([20, 30, 40]);
  }

  playDisable() {
    this.playPowerOff();
  }

  playEnable() {
    this.playPowerOn();
  }
}

export const sounds = new SoundEffects();


