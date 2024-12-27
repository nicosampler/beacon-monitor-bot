export type Incident = "performance" | "inactivity";

export enum IncidentType {
  PERFORMANCE = "PERFORMANCE",
  INACTIVE = "INACTIVE",
}

export interface PerformanceIncidentData {
  currentPerformance: number;
  threshold: number;
}

export interface InactiveIncidentData {
  validators: Array<{
    validatorId: number;
    startSlot: number;
  }>;
  threshold: number;
}
