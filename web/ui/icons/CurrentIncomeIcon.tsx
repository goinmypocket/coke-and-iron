import type { CSSProperties } from "react";
export function CurrentIncomeIcon({amount=0,size=16,x,y,style,iconOnly=false}:{size?: number; x?: number; y?: number; style?: CSSProperties; amount?:number; iconOnly?:boolean}) {
 return <svg width={size*(iconOnly?12:24)/16} height={size} x={x} y={y} viewBox={`0 0 ${iconOnly?12:24} 16`} style={{verticalAlign:"middle",flexShrink:0,...style}} aria-label={iconOnly?"Current income":`Current income ${amount}`}>
  <path d="M6 14V2M2 6l4-4 4 4" fill="none" stroke="#24332f" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  {!iconOnly?<text x="17" y="11" textAnchor="middle" fill="#24332f" fontSize={String(amount).length>2?7:9} fontWeight="650">{amount}</text>:null}
 </svg>;
}
