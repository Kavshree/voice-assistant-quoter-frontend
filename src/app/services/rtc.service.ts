import { Injectable, NgZone } from "@angular/core";
import { BehaviorSubject, Subject } from "rxjs";

type ConnState = "new"|"connecting"|"connected"|"disconnected"|"failed"|"closed";

@Injectable({ providedIn: "root" })
export class RtcService {
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;

  private state$ = new BehaviorSubject<ConnState>("new");
  private msg$ = new Subject<string>(); // raw messages from datachannel

  constructor(private zone: NgZone) {}

  getState$() { return this.state$.asObservable(); }
  getMessages$() { return this.msg$.asObservable(); }

  async connect(stream: MediaStream, clientSecret: string): Promise<void> {
    this.pc = new RTCPeerConnection();
    this.pc.addTrack(stream.getTracks()[0], stream);

    this.pc.onconnectionstatechange = () => {
      const s = this.pc?.connectionState as ConnState;
      this.zone.run(() => this.state$.next(s || "new"));
    };

    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.onmessage = (e) => this.msg$.next(String(e.data));

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    const resp = await fetch("https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview", {
      method: "POST",
      headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
      body: offer.sdp as any
    });
    const answer = await resp.text();
    await this.pc.setRemoteDescription({ type: "answer", sdp: answer });
  }

  send(text: string) { this.dc?.send(text); }

  disconnect(): void {
    try { this.dc?.close(); } catch {}
    try { this.pc?.close(); } catch {}
    this.dc = undefined; this.pc = undefined;
    this.zone.run(() => this.state$.next("closed"));
  }
}
