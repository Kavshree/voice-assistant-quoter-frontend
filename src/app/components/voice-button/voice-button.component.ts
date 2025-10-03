import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { Subscription } from "rxjs";
import { Status, VoiceService } from "../../services/voice.service";
import { VoiceIndicatorComponent } from "../voice-indicator/voice-indicator.component";
import { PayloadDebugComponent } from "../payload-debug/payload-debug.component";


@Component({
    selector: "app-voice-button",
    templateUrl: "./voice-button.component.html",
    styleUrls: ["./voice-button.component.scss"],
     imports: [CommonModule, VoiceIndicatorComponent,PayloadDebugComponent ],
    standalone: true,
})
export class VoiceButtonComponent {
  status: Status = "idle";
  sub: Subscription;

  constructor(private voice: VoiceService) {
    this.sub = this.voice.getStatus$().subscribe(s => this.status = s);
  }

  async toggle() {
    if (this.status === "idle" || this.status === "error") await this.voice.startVoice();
    else this.voice.stopVoice();
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

}