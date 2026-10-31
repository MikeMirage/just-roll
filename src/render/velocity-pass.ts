import { Vector2 } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Spatial blur only: no previous-frame accumulation, so it cannot leave ghost
// trails. Protect the marble and central racing line; smear the periphery.
export class VelocityPass extends ShaderPass {
  constructor(){
    super({
      uniforms:{tDiffuse:{value:null},uAmount:{value:0},uCenter:{value:new Vector2(.5,.5)},uFocus:{value:new Vector2(.5,.4)},uAspect:{value:1}},
      vertexShader:`varying vec2 vUv;
        void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`uniform sampler2D tDiffuse;
        uniform float uAmount;uniform float uAspect;
        uniform vec2 uCenter;uniform vec2 uFocus;varying vec2 vUv;
        void main(){
          vec4 original=texture2D(tDiffuse,vUv);
          vec2 radial=vUv-uCenter;
          float edge=smoothstep(.18,.8,length(radial*vec2(uAspect,1.0)));
          float marble=smoothstep(.09,.23,length((vUv-uFocus)*vec2(uAspect,1.0)));
          float amount=uAmount*edge*marble;
          vec3 result=original.rgb*.34;
          for(int i=0;i<6;i++){
            float offset=(float(i)/5.0-.5)*amount;
            result+=texture2D(tDiffuse,clamp(vUv+radial*offset,vec2(.001),vec2(.999))).rgb*.11;
          }
          gl_FragColor=vec4(result,original.a);
        }`,
    });
  }
}
