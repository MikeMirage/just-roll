import { add, cross, dot, mul, norm, sub, v, clamp, type Frame, type Road, type CourseModule } from './track';

const smooth=(x:number)=>{const t=clamp(x,0,1);return t*t*(3-2*t);};

/** Distances are shared race progress. Each branch has its own physical ribbon. */
export function buildModularCourse() {
  const modules:CourseModule[]=[
    {id:'grid',name:'PARRILLA / 40',kind:'straight',from:0,to:200},
    {id:'split',name:'SPLITTER / ELIGE CARRIL',kind:'splitter',from:200,to:580},
    {id:'merge',name:'REAGRUPAMIENTO',kind:'turn',from:580,to:760},
    {id:'fork',name:'BIFURCACIÓN / RIESGO O AGARRE',kind:'fork',from:760,to:1320},
    {id:'tunnel-a',name:'TÚNEL TURBO / I',kind:'tunnel',from:1320,to:1680},
    {id:'slalom',name:'DESVIADORES',kind:'turn',from:1680,to:1880},
    {id:'jump',name:'SALTO / ATERRIZAJE ANCHO',kind:'jump',from:1880,to:2240},
    {id:'funnel',name:'VÓRTEX / EMBUDO · 3 SALIDAS',kind:'funnel',from:2240,to:2500},
    {id:'tunnel-b',name:'TÚNEL TURBO / II',kind:'tunnel',from:2500,to:2820},
    {id:'loop',name:'ORBITAL / LOOP MAGNÉTICO',kind:'loop',from:2820,to:3200},
    {id:'finish',name:'RECTA FINAL',kind:'finish',from:3200,to:3600},
  ];
  const heading=(s:number)=>1*smooth((s-580)/180)-.9*smooth((s-1320)/360)-1*smooth((s-1680)/200)-.9*smooth((s-2240)/260)-1.3*smooth((s-2820)/280);
  const spine:Frame[]=[];
  let position=v(0,40,0);
  for(let s=0;s<=3600;s+=2){
    if(s>0){const h=heading(s-1);position=add(position,v(Math.sin(h)*2,0,Math.cos(h)*2));}
    const h=heading(s),tangent=norm(v(Math.sin(h),-.003+Math.cos(s/410)*.006,Math.cos(h)));
    const right=norm(v(tangent.z,0,-tangent.x));
    spine.push({s,position:v(position.x,40-s*.003+Math.sin(s/410)*2.46,position.z),tangent,right,normal:norm(cross(tangent,right))});
  }
  // A banked, descending spiral with a wide open basin and three full-size
  // outlets. No single-file throat or stationary bowl simulation.
  const entry=spine[2240/2],h=heading(2240),forward=v(Math.sin(h),0,Math.cos(h)),radial=v(Math.cos(h),0,-Math.sin(h));
  const funnelPoint=(s:number)=>{
    const t=clamp((s-2240)/200,0,1),angle=t*4.3,radius=70-18*smooth(t);
    return add(add(add(entry.position,mul(radial,70-radius*Math.cos(angle))),mul(forward,radius*Math.sin(angle))),v(0,-12*smooth(t),0));
  };
  for(let s=2240;s<=2440;s+=2){
    const t=(s-2240)/200,tangent=norm(sub(funnelPoint(s+.1),funnelPoint(s-.1)));
    const flatRight=norm(v(tangent.z,0,-tangent.x)),flatNormal=norm(cross(tangent,flatRight));
    const bank=-.55*smooth((s-2240)/40)*smooth((2440-s)/40);
    const right=add(mul(flatRight,Math.cos(bank)),mul(flatNormal,Math.sin(bank)));
    spine[s/2]={s,position:funnelPoint(s),tangent,right,normal:norm(cross(tangent,right)),width:28+24*Math.sin(Math.PI*t)**2};
  }
  const exitHeading=h+4.3,exitForward=v(Math.sin(exitHeading),0,Math.cos(exitHeading)),exitRight=v(Math.cos(exitHeading),0,-Math.sin(exitHeading));
  const exit=spine[2440/2].position;
  for(let s=2442;s<=3600;s+=2)spine[s/2]={s,position:add(exit,mul(exitForward,s-2440)),tangent:exitForward,right:exitRight,normal:v(0,1,0)};
  // The lateral drift separates the two legs of a true 360-degree loop.
  // Projecting a fixed side axis onto the tangent gives continuous frames at
  // vertical and inverted points, where world-up cross products are singular.
  const loopEntry=spine[2880/2].position;
  const loopPoint=(s:number)=>{
    const t=clamp((s-2880)/260,0,1),angle=t*Math.PI*2;
    return add(add(add(loopEntry,mul(exitForward,40*Math.sin(angle))),mul(exitRight,44*smooth(t))),v(0,40*(1-Math.cos(angle)),0));
  };
  for(let s=2880;s<=3140;s+=2){
    const tangent=norm(sub(loopPoint(s+.1),loopPoint(s-.1)));
    const right=norm(sub(exitRight,mul(tangent,dot(exitRight,tangent))));
    spine[s/2]={s,position:loopPoint(s),tangent,right,normal:norm(cross(tangent,right))};
  }
  const loopExit=spine[3140/2].position;
  for(let s=3142;s<=3600;s+=2)spine[s/2]={s,position:add(loopExit,mul(exitForward,s-3140)),tangent:exitForward,right:exitRight,normal:v(0,1,0)};
  const roads:Road[]=[];
  const make=(module:CourseModule,id:string,width:number,offset:(s:number)=>number=()=>0,gap?:{from:number;to:number})=>{
    const frames:Frame[]=[];
    const point=(s:number)=>{
      const base=spine[Math.round(clamp(s,0,3600)/2)];
      let lift=0;
      if(gap){
        const d=s-gap.from;
        if(d>=-40&&d<=0)lift=5*Math.pow((d+40)/40,2);
        else if(d>0&&s<gap.to)lift=5*(1-d/(gap.to-gap.from));
      }
      return add(add(base.position,mul(base.right,offset(s))),v(0,lift,0));
    };
    for(let s=module.from;s<=module.to;s+=2){
      // Sample the offset path itself: both physics and steering follow the branch.
      const a=point(Math.max(module.from,s-2)),b=point(Math.min(module.to,s+2));
      const base=spine[s/2],tangent=module.kind==='loop'?base.tangent:norm(sub(b,a));
      const right=norm(sub(base.right,mul(tangent,dot(base.right,tangent))));
      frames.push({s,position:point(s),tangent,right,normal:norm(cross(tangent,right)),width:id==='funnel'?base.width??28:width});
    }
    roads.push({id,module:module.id,label:id==='safe'?'AGARRE / SEGURA':id==='risk'?'SALTO / ATAJO':module.name,kind:module.kind,from:module.from,to:module.to,width,frames,gaps:gap?[gap]:[],branch:module.kind==='fork'||module.kind==='splitter'||id.startsWith('funnel-exit')});
  };
  for(const module of modules){
    const envelope=(s:number)=>smooth((s-module.from)/85)*smooth((module.to-s)/85);
    if(module.kind==='splitter'){
      for(const lane of [0,-1,1])make(module,`split-${lane}`,9,s=>lane*(9+9*envelope(s)));
    }else if(module.kind==='fork'){
      make(module,'safe',14,s=>7+43*envelope(s));
      make(module,'risk',14,s=>-7-16*envelope(s),{from:1080,to:1104});
    }else if(module.kind==='funnel'){
      make({...module,to:2440},'funnel',52);
      for(const lane of [0,-1,1])make({...module,from:2440},`funnel-exit-${lane}`,9,s=>lane*(9+2*Math.sin((s-2440)/60*Math.PI)**2));
    }else make(module,module.id,28,()=>0,module.kind==='jump'?{from:2080,to:2106}:undefined);
  }
  return {frames:spine,roads,modules};
}
