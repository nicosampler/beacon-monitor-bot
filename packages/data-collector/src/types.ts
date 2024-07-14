export type TimeFrame = "hourly" | "daily" | "weekly" | "monthly" | "yearly";

declare global {
  namespace PrismaJson {
    type CommitteeValidators = string[];
  }
}

export type GenericResponse<T> = {
  data: T;
  status: string;
};
