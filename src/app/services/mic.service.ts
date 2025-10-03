import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class MicService {
  private stream?: MediaStream;

  async request(): Promise<MediaStream> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return this.stream;
  }

    isLive(): boolean {
    const t = this.stream?.getAudioTracks?.()[0];
    return !!t && t.readyState === "live" && t.enabled;
  }

    /** Wait briefly for track to become live (some browsers lag) */
  async waitUntilLive(timeoutMs = 2000): Promise<void> {
    const t = this.stream?.getAudioTracks?.()[0];
    if (!t) throw new Error("no_track");
    if (t.readyState === "live") return;

    await new Promise<void>((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error("mic_inactive_timeout")); };
      const cleanup = () => {
        clearTimeout(timer);
        t.removeEventListener("unmute", done);
        t.removeEventListener("ended", fail);
      };
      const timer = setTimeout(fail, timeoutMs);
      t.addEventListener("unmute", done);
      t.addEventListener("ended", fail);
    });
  }

  stop(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = undefined;
  }

  getStream(): MediaStream | undefined { return this.stream; }
}
