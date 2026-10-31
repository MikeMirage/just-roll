import { clamp } from './track';

export type TouchMode = 'digital' | 'analog';

/** Course-relative target, expressed screen-left (-1) to screen-right (+1).
 * This produces a steering command; it never changes the body's position.
 */
export function steerToTouchTarget(target:number,side:number,lateralSpeed:number,width:number){
  const usableHalf=Math.max(0,width/2-1.3);
  const error=side+clamp(target,-1,1)*usableHalf;
  if(Math.abs(error)<.06&&Math.abs(lateralSpeed)<.08)return 0;
  return clamp(error*.8+lateralSpeed*.22,-1,1);
}

/** Pointer state is independent of DOM, physics rate, and the turbo finger. */
export class TouchSteering {
  readonly pointers=new Map<number,number>();
  target:number|null=null;
  private owner:number|null=null;

  constructor(public mode:TouchMode='digital'){}

  setMode(mode:TouchMode){this.clear();this.mode=mode;}
  clear(){this.pointers.clear();this.owner=null;this.target=null;}

  press(id:number,x:number){
    this.pointers.set(id,clamp(x,0,1));
    if(this.mode==='analog'&&this.owner===null){this.owner=id;this.target=clamp(x,0,1)*2-1;}
  }
  move(id:number,x:number){
    if(!this.pointers.has(id))return;
    this.pointers.set(id,clamp(x,0,1));
    if(this.mode==='analog'&&this.owner===id)this.target=clamp(x,0,1)*2-1;
  }
  release(id:number,cancelled=false){
    this.pointers.delete(id);
    if(this.owner===id){
      this.owner=this.pointers.keys().next().value??null;
      if(this.owner!==null)this.target=this.pointers.get(this.owner)!*2-1;
      else if(cancelled)this.target=null;
    }
  }

  get left(){return [...this.pointers.values()].some(x=>x<.5);}
  get right(){return [...this.pointers.values()].some(x=>x>=.5);}
  sample(side:number,lateralSpeed:number,width:number){
    if(this.mode==='digital')return Number(this.right)-Number(this.left);
    return this.target===null?0:steerToTouchTarget(this.target,side,lateralSpeed,width);
  }
}
