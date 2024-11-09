import { AsyncTask, SimpleIntervalJob } from "toad-scheduler";
import { fetchNextCommittees } from "@/src/feed/fetchCommittee.js";

const ID = "FetchCommittee";

export const job = new SimpleIntervalJob(
  { seconds: 2, runImmediately: true },
  new AsyncTask(`${ID}_task`, fetchNextCommittees),
  {
    id: ID,
    preventOverrun: true,
  }
);
