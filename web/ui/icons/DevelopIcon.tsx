import type { CSSProperties } from "react";
export function DevelopIcon({size=16,x,y,style,consumption=false}:{size?: number; x?: number; y?: number; style?: CSSProperties; consumption?:boolean}) {
 return <svg width={size} height={size} x={x} y={y} viewBox="0 0 16 16" style={{verticalAlign:"middle",flexShrink:0,...style}} aria-label={consumption?"Cannot develop":"Develop"}>
  <path d="M6 12v-2C2 6 4 1 8 1s6 5 2 9v2M6 14h4" fill="none" stroke="#24332f" strokeWidth="1.2" strokeLinecap="round"/>
  {consumption?<path d="m2 14 12-12" stroke="#a12828" strokeWidth="1.6"/>:null}
 </svg>;
}
