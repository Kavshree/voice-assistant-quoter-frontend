import { Injectable } from "@angular/core";

@Injectable({ providedIn: "root" })
export class MicService {
  private stream?: MediaStream;

  async request(): Promise<MediaStream> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return this.stream;
  }

  stop(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = undefined;
  }

  getStream(): MediaStream | undefined { return this.stream; }
}
