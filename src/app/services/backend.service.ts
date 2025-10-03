export const BE_URL = `http://localhost:3000`;

import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

@Injectable({ providedIn: "root" })
export class BackendService {
  async getEphemeral(): Promise<string> {
    const r = await fetch(`${BE_URL}/ephemeral`);
    const j = await r.json();
    return j?.client_secret?.value || "";
  }

  async postQuote(payload: any): Promise<void> {
    await fetch(`${BE_URL}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }
}
