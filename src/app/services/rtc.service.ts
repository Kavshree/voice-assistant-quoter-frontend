import { Injectable, NgZone } from "@angular/core";
import { BehaviorSubject, Subject, Observable } from "rxjs";

type ConnState = "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";

@Injectable({ providedIn: "root" })
export class RtcService {
  private pc?: RTCPeerConnection;
  private dc?: RTCDataChannel;

  private state$ = new BehaviorSubject<ConnState>("new");
  private msg$ = new Subject<string>();

  private outbox: string[] = [];
  private wired = false;

  constructor(private zone: NgZone) {}

  getState$(): Observable<ConnState> { return this.state$.asObservable(); }
  getMessages$(): Observable<string> { return this.msg$.asObservable(); }

  send(text: string): void {
    if (!this.dc || this.dc.readyState !== "open") { this.outbox.push(text); return; }
    try { this.dc.send(text); }
    catch (e) { console.warn("[rtc.send] re-queue", e); this.outbox.push(text); }
  }

  async connect(stream: MediaStream, clientSecret: string): Promise<void> {
    this.pc = new RTCPeerConnection();

    const [mic] = stream.getTracks();
    if (mic) this.pc.addTrack(mic, stream);

    this.pc.ontrack = (e) => {
      let el = document.getElementById("oai-audio") as HTMLAudioElement | null;
      if (!el) { el = document.createElement("audio"); el.id = "oai-audio"; el.autoplay = true; document.body.appendChild(el); }
      el.srcObject = e.streams[0];
    };

    this.pc.onconnectionstatechange = () => {
      const s = this.pc?.connectionState as ConnState;
      this.zone.run(() => this.state$.next(s || "new"));
    };

    // one datachannel total
    const local = this.pc.createDataChannel("oai-events");
    this.wire(local);
    this.pc.ondatachannel = (ev) => { if (!this.wired) this.wire(ev.channel); else ev.channel.close(); };

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

  disconnect(): void {
    try { this.dc?.close(); } catch {}
    try { this.pc?.close(); } catch {}
    this.dc = undefined; this.pc = undefined; this.outbox = []; this.wired = false;
    this.zone.run(() => this.state$.next("closed"));
  }

  private wire(dc: RTCDataChannel): void {
    if (this.wired) return;
    this.wired = true;
    this.dc = dc;
    dc.binaryType = "arraybuffer" as any;

    dc.onmessage = async (e) => {
      let s = "";
      if (typeof e.data === "string") s = e.data;
      else if (e.data instanceof ArrayBuffer) s = new TextDecoder().decode(e.data);
      else if (e.data instanceof Blob) s = await e.data.text();

      this.msg$.next(s);

      try {
        const obj = JSON.parse(s);
        if (obj?.type) console.log("[rtc]", obj.type);
        if (obj?.type === "error") console.warn("[rtc error]", obj);
      } catch { console.log("[rtc][raw]", s.slice(0, 140)); }
    };

    dc.onopen = (): void => {
      try {
        if (this.outbox.length && this.dc?.readyState === "open") {
          for (const m of this.outbox) this.dc.send(m);
          this.outbox = [];
        }
      } catch (e) { console.warn("[rtc] flush err", e); }
    };

    dc.onclose = (): void => console.log("[rtc] dc closed");
    dc.onerror  = (e): void => console.warn("[rtc] dc error", e);
  }
}
