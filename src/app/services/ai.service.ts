import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { RtcService } from "./rtc.service";
import { Payload, emptyPayload } from "../types/payload";

type FnAcc = { name?: string; args: string };

@Injectable({ providedIn: "root" })
export class AiService {
  private payload$ = new BehaviorSubject<Payload>({ ...emptyPayload });
  getPayload$() { return this.payload$.asObservable(); }

  // function-call accumulation
  private fn: Record<string, FnAcc> = {};

  // turn gating
  private active = false;     // after response.created
  private scheduling = false; // after we send response.create
  private pending = false;    // speech finished while active

  // noise guard
  private speechStart = 0;
  private minSpeechMs = 400;

  constructor(private rtc: RtcService) {
    this.rtc.getMessages$().subscribe(msg => this.onMessage(msg));
  }

  // ---------- EVENTS ----------
  private onMessage(raw: string): void {
    const s = String(raw);
    let evt: any;
    try { evt = JSON.parse(s); } catch { return; }

    // lifecycle
    if (evt?.type === "response.created") { this.active = true; this.scheduling = false; return; }
    if (evt?.type === "response.completed" || evt?.type === "response.done") {
      this.active = false;
      if (this.pending) { this.pending = false; queueMicrotask(() => this.sendTurn()); }
      return;
    }

    // speech start/stop -> drive turns after real utterance
    if (evt?.type === "input_audio_buffer.speech_started") {
      this.speechStart = Date.now();
      return;
    }
    if (evt?.type === "input_audio_buffer.speech_stopped") {
      const dur = Date.now() - this.speechStart;
      if (dur < this.minSpeechMs) return;                // ignore tiny blips
      if (this.active || this.scheduling) this.pending = true;
      else this.sendTurn();
      return;
    }

    // ---- Tool call plumbing ----
    if (evt?.type === "response.output_item.added" && evt.item?.type === "function_call") {
      const id = evt.item.call_id as string;
      const name = evt.item.name as string;
      if (id) this.fn[id] = { name, args: "" };
      return;
    }

    if (
      (evt?.type === "response.function_call.arguments.delta" ||
       evt?.type === "response.function_call_arguments.delta") && evt.call_id
    ) {
      const id = evt.call_id as string;
      this.fn[id] ||= { args: "" };
      this.fn[id].args += (evt.delta || "");
      return;
    }

    if (
      (evt?.type === "response.function_call.arguments.done" ||
       evt?.type === "response.function_call_arguments.done") && evt.call_id
    ) {
      const id = evt.call_id as string;
      const acc = this.fn[id] || { args: "" };
      const name = acc.name || evt.name || "";
      const finalArgs: string =
        typeof evt.arguments === "string" ? evt.arguments : acc.args || "{}";

      let args: any = {};
      try { args = finalArgs ? JSON.parse(finalArgs) : {}; } catch {}

      // 1) apply tool call to UI
      this.handleFunctionCall(name, args);

      // 2) ACK tool output (required)
      this.sendToolOutput(id, { ok: true });

      // 3) Schedule next server turn if nothing is in flight
      queueMicrotask(() => {
        if (this.active || this.scheduling) this.pending = true;
        else this.sendTurn();
      });

      delete this.fn[id];
      return;
    }

    if (evt?.type === "error") console.warn("[rtc error]", evt);
  }

  // ---------- SEND A TURN ----------
  private sendTurn(): void {
    if (this.active || this.scheduling) { this.pending = true; return; }
    this.scheduling = true;

    const ask = this.nextAsk();
    this.rtc.send(JSON.stringify({
      type: "response.create",
      response: {
        // We want spoken reply + ability to use tools
        modalities: ["audio", "text"],
        conversation: "auto",
        tool_choice: "auto",
        instructions:
`Ask exactly ONE missing field in a short, friendly way: "${ask}".
Use the tools to record any fields you extract. Do not speak about tools. Only acknowledge if you recorded a field. Stay strictly on auto insurance.`
      }
    }));
  }

  // ---------- TOOL OUTPUT ACK ----------
  private sendToolOutput(callId: string, data: any): void {
    this.rtc.send(JSON.stringify({
      type: "response.tool_output",
      tool_output: { tool_call_id: callId, output: JSON.stringify(data) }
    }));
  }

  // ---------- APPLY TOOL CALLS ----------
  private handleFunctionCall(name: string, args: any): void {
    const p: Payload = JSON.parse(JSON.stringify(this.payload$.value));

    if (name === "payload_upsert") {
      const path = args?.path;
      const val  = args?.value;
      switch (path) {
        case "vehicleDetails.make":  p.vehicleDetails.make  = val ?? null; break;
        case "vehicleDetails.model": p.vehicleDetails.model = val ?? null; break;
        case "vehicleDetails.year":  p.vehicleDetails.year  = Number(val); break;
        case "previousClaims.claimMadeInLast3Years": p.previousClaims.claimMadeInLast3Years = !!val; break;
        case "previousClaims.claimAtFault":          p.previousClaims.claimAtFault = !!val; break;
        case "postalCode":                           p.postalCode = (val ?? "").toString().replace(/\s+/g,"").toUpperCase(); break;
        default: console.warn("[tool] unknown path", args);
      }
      this.payload$.next(p);
      return;
    }

    if (name === "manager_ready" && args?.payload) {
      this.payload$.next(args.payload as Payload);
      console.log("Final payload", args.payload);
      return;
    }
  }

  // ---------- PICK NEXT FIELD ----------
  private nextAsk(): string {
    const p = this.payload$.value;
    if (!p.vehicleDetails.make)  return "What’s the car make?";
    if (!p.vehicleDetails.model) return "And the model?";
    if (p.vehicleDetails.year == null) return "What year is it?";
    if (p.previousClaims.claimMadeInLast3Years == null) return "Any claims in the last 3 years?";
    if (p.previousClaims.claimAtFault == null) return "Was the claim at fault?";
    if (!p.postalCode) return "Lastly, what’s your postal code?";
    return "Everything looks complete—should I lock this in?";
  }
}
