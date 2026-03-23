// client/src/utils/audioManager.ts
/**
 * Gerenciador Global de Áudio (Singleton)
 * 
 * Por que isso é necessário (Política de Autoplay)?
 * Os navegadores modernos (Chrome, Safari, Firefox, Edge) bloqueiam a reprodução
 * automática de áudio (seja via elemento <audio> ou via Web Audio API, como o AudioContext)
 * logo que a página carrega. Isso evita que sites toquem sons de forma intrusiva 
 * sem que o usuário permita.
 * 
 * Para contornar e permitir sons de notificação:
 * 1. O AudioContext é criado em estado "suspenso" (suspended).
 * 2. O usuário precisa interagir com a página de alguma forma (clique, toque na tela, tecla).
 * 3. Durante essa primeira interação, chamamos o método `resume()` do AudioContext.
 * 4. A partir daí, o contexto de áudio fica "desbloqueado" (running) e podemos tocar 
 *    sons a qualquer momento (como ao receber um Web Socket de nova senha).
 */

class AudioManager {
  private static instance: AudioManager;
  public context: AudioContext | null = null;
  public isUnlocked: boolean = false;

  private constructor() {
    this.initContext();
  }

  // Garante que só existirá UMA MESMA instância de AudioContext na aplicação inteira
  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private initContext() {
    if (typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.context = new AudioCtx();
      }
    }
  }

  /**
   * Tenta desbloquear o AudioContext fazendo o "resume".
   * Essa função DEVE ser chamada em resposta a um evento de usuário (click, touch, etc)
   */
  public async unlock(): Promise<boolean> {
    if (this.isUnlocked) return true;
    if (!this.context) return false;

    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch (err) {
        console.error("Falha ao desbloquear o AudioContext:", err);
        return false;
      }
    }

    // Toca um buffer mudo extremamente rápido para forçar o destravamento completo
    // (Útil especialmente para contornar restrições duras do iOS Safari)
    try {
      const buffer = this.context.createBuffer(1, 1, 22050);
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      source.start(0);
    } catch (e) {
        // ignora erro
    }

    this.isUnlocked = true;
    return true;
  }

  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private activeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /**
   * Converte texto em fala (TTS) usando a API nativa do navegador com repetições confiáveis.
   */
  public speak(text: string, repeats: number = 1, intervalMs: number = 1200): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
          console.warn("Speech Synthesis não suportado.");
          resolve();
          return;
      }

      // Cancela qualquer fala anterior e os timers agendados
      window.speechSynthesis.cancel();
      if (this.activeTimeoutId) {
        clearTimeout(this.activeTimeoutId);
        this.activeTimeoutId = null;
      }

      const speakRecursive = (remaining: number) => {
        if (remaining <= 0) {
          this.activeUtterance = null;
          resolve();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        this.activeUtterance = utterance; // Previne Garbage Collection (Bug comum no Chrome)
        
        console.log(`[TTS] Falando: "${text}" (Restam ${remaining} repetições)`, this.activeUtterance);
        
        utterance.lang = 'pt-BR';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices();
        const brVoice = voices.find(v => v.lang.includes('pt-BR'));
        if (brVoice) utterance.voice = brVoice;

        utterance.onend = () => {
          if (remaining > 1) {
            this.activeTimeoutId = setTimeout(() => speakRecursive(remaining - 1), intervalMs);
          } else {
            this.activeUtterance = null;
            resolve();
          }
        };

        utterance.onerror = (err) => {
          console.error("[TTS] Erro na fala:", err);
          if (remaining > 1) {
            this.activeTimeoutId = setTimeout(() => speakRecursive(remaining - 1), intervalMs);
          } else {
            this.activeUtterance = null;
            resolve();
          }
        };

        window.speechSynthesis.speak(utterance);
      };

      speakRecursive(repeats);
    });
  }

  /**
   * Toca o som de notificação (Chime majestoso)
   * Agora isso pode ser chamado de qualquer lugar, desde que o áudio já esteja desbloqueado.
   */
  public playLoudSmoothChime() {
    if (!this.context || this.context.state !== 'running') {
      console.warn("Áudio bloqueado pela política de Autoplay. Aguardando interação do usuário.");
      return;
    }

    const ctx = this.context;
    
    try {
      const playNote = (freq: number, start: number, dur: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        const delay = ctx.createDelay();
        delay.delayTime.value = 0.2;
        const delayGain = ctx.createGain();
        delayGain.gain.value = 0.25;
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.connect(delay);
        delay.connect(delayGain);
        delayGain.connect(ctx.destination);
        
        osc.type = 'sine'; // Som muito suave
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };

      const t0 = 0;
      const t1 = 0.6;

      playNote(659.25, t0, 3.0, 0.7); // E5
      playNote(830.61, t0, 3.0, 0.4); // G#5
      playNote(329.63, t0, 3.5, 0.7); // E4

      playNote(554.37, t1, 4.0, 0.7); // C#5
      playNote(659.25, t1, 4.0, 0.4); // E5
      playNote(277.18, t1, 4.5, 0.7); // C#4
    } catch (e) {
      console.error("Audio synth error:", e);
    }
  }
}

export const audioManager = AudioManager.getInstance();
