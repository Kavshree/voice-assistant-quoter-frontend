import { Injectable } from "@angular/core";
import { BehaviorSubject, Subscription } from "rxjs";
import { BackendService } from "./backend.service";
import { MicService } from "./mic.service";
import { RtcService } from "./rtc.service";

export type Status = "idle"|"connecting"|"live"|"error"|"permission-denied";

@Injectable({ providedIn: "root" })
export class VoiceService {
  private status$ = new BehaviorSubject<Status>("idle");
  private sub?: Subscription;
  constructor(private be: BackendService, private mic: MicService, private rtc: RtcService) {}
  getStatus$() { return this.status$.asObservable(); }

  async startVoice(): Promise<void> {
    try {
      this.status$.next("connecting");

      // 1) Get mic permission first
      let stream: MediaStream;
      try {
        stream = await this.mic.request();
      } catch (err: any) {
        if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
          this.status$.next("permission-denied");
          return;
        }
        throw err;
      }

      // 2) Ensure the track is actually live
      if (!this.mic.isLive()) {
        try { await this.mic.waitUntilLive(2000); }
        catch { this.status$.next("error"); return; }
      }

      // 3) Only now call BE for ephemeral token
      const token = await this.be.getEphemeral();
      if (!token) { this.status$.next("error"); return; }

      // 4) Connect to Realtime
      await this.rtc.connect(stream, token);

      this.sub?.unsubscribe();
      this.sub = this.rtc.getState$().subscribe(s => {
        if (s === "connected") this.status$.next("live");
        else if (s === "failed" || s === "disconnected") this.status$.next("error");
      });
    } catch (e) {
      console.error(e);
      this.stopVoice();
      this.status$.next("error");
    }
  }

  stopVoice(): void {
    this.rtc.disconnect();
    this.mic.stop();
    this.sub?.unsubscribe();
    this.status$.next("idle");
  }
}
