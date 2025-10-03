import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AiService } from "../../services/ai.service";
import { Observable } from "rxjs";
import { Payload } from "../../types/payload";

@Component({
  selector: "app-payload-debug",
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="pd" *ngIf="payload$ | async as p">
    <div class="row"><b>Make</b><span>{{p.vehicleDetails.make || '—'}}</span></div>
    <div class="row"><b>Model</b><span>{{p.vehicleDetails.model || '—'}}</span></div>
    <div class="row"><b>Year</b><span>{{p.vehicleDetails.year ?? '—'}}</span></div>
    <div class="row"><b>Claims ≤3y</b><span>{{p.previousClaims.claimMadeInLast3Years === null ? '—' : p.previousClaims.claimMadeInLast3Years}}</span></div>
    <div class="row"><b>At fault</b><span>{{p.previousClaims.claimAtFault === null ? '—' : p.previousClaims.claimAtFault}}</span></div>
    <div class="row"><b>Postal</b><span>{{p.postalCode || '—'}}</span></div>
  </div>`,
  styles: [`
    .pd{ margin-top:10px; padding:10px 12px; border-radius:12px;
         background: linear-gradient(135deg, rgba(160,230,140,.20), rgba(150,140,255,.18));
         color:#2f2a64; width:min(520px, 90vw);}
    .row{ display:flex; justify-content:space-between; padding:4px 0; }
    b{ font-weight:700; }
  `]
})
export class PayloadDebugComponent {
  payload$: Observable<Payload>;
  constructor(ai: AiService){ this.payload$ = ai.getPayload$(); }
}
