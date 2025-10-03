import { Component, OnDestroy, signal, computed, effect, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Subscription } from "rxjs";
import { VoiceService } from "../../services/voice.service";
import { MicService } from "../../services/mic.service";

type Status = "idle"|"connecting"|"live"|"error";

@Component({
  selector: "app-voice-indicator",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./voice-indicator.component.html",
  styleUrls: ["./voice-indicator.component.css"]
})
export class VoiceIndicatorComponent implements OnDestroy {
  private subs: Subscription[] = [];

  // reactive state
  status = signal<Status>("idle");
  speaking = signal(false);

  // WebAudio
  private audioCtx?: AudioContext;
  private analyser?: AnalyserNode;
  private rafId?: number;

  constructor(private voice: VoiceService, private mic: MicService) {
    this.subs.push(
      this.voice.getStatus$().subscribe(s => {
        this.status.set(s as Status);
        if (s === "live") this.startVUMeter();
        else this.stopVUMeter();
      })
    );
  }

  private startVUMeter() {
    // already running?
    if (this.analyser) return;
    const stream = this.mic.getStream();
    if (!stream) return;

    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const src = this.audioCtx.createMediaStreamSource(stream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    src.connect(this.analyser);

    const data = new Uint8Array(this.analyser.frequencyBinCount);

    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteTimeDomainData(data);
      // compute RMS quickly
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128; // -1..1
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      // simple threshold; tweak if needed
      this.speaking.set(rms > 0.03);
      this.rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  private stopVUMeter() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = undefined;
    try { this.audioCtx?.close(); } catch {}
    this.audioCtx = undefined;
    this.analyser = undefined;
    this.speaking.set(false);
  }
  
   stop() { this.voice.stopVoice(); }

  @HostListener("document:keydown.escape")
  onEsc() { if (this.status() === "live") this.stop(); }

  // convenience for template
  get visible() { return this.status() === "live"; }

    ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
    this.stopVUMeter();
  }
}
