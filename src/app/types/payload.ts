export type Payload = {
  vehicleDetails: { make: string|null; model: string|null; year: number|null };
  previousClaims: { claimMadeInLast3Years: boolean|null; claimAtFault: boolean|null };
  postalCode: string|null;
};

export const emptyPayload: Payload = {
  vehicleDetails: { make: null, model: null, year: null },
  previousClaims: { claimMadeInLast3Years: null, claimAtFault: null },
  postalCode: null
};
