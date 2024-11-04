import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { fetchNextCommittees } from "@/src/feed/fetchCommittee.js";

const ID = "FetchCommittee";

export const job = new SimpleIntervalJob(
  { milliseconds: 250, runImmediately: true },
  new AsyncTask(`${ID}_task`, fetchNextCommittees),
  {
    id: ID,
    preventOverrun: true,
  }
);
