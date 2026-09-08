import { DevelopIcon } from "./DevelopIcon";
import { INDUSTRY_ICON } from "../industryIcons";

export function ActionIcon({ name }: { name: string }) {
  if (name === "Build") return <img src={INDUSTRY_ICON.MANUFACTURER} alt="" width={24} height={24} />;
  if (name === "Develop") return <span aria-hidden="true"><DevelopIcon size={24} /></span>;
  return <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {name === "Network" ? <path d="m9 15 6-6M8 13l-2 2a4 4 0 0 0 6 6l4-4a4 4 0 0 0-1-6M16 11l2-2a4 4 0 0 0-6-6L8 7a4 4 0 0 0 1 6" /> : null}
    {name === "Sell" ? <><path d="M4 9a8 8 0 0 1 14-3l2 3M20 15a8 8 0 0 1-14 3l-2-3M4 4v5h5M20 20v-5h-5" /></> : null}
    {name === "Loan" ? <><circle cx="12" cy="12" r="10" /><path d="M15 7c-4-3-6 1-4 5v4m-3-4h6m-6 5h8" /></> : null}
    {name === "Scout" ? <><circle cx="6" cy="15" r="4" /><circle cx="18" cy="15" r="4" /><path d="m2 14 3-9h3l2 9m4 0 2-9h3l3 9M10 12h4" /></> : null}
    {name === "Pass" ? <path d="M3 12h18m-7-7 7 7-7 7" /> : null}
  </svg>;
}
