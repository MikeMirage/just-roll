export type Point = readonly [number, number, number];
export interface CircuitDefinition {
  id: string; name: string; subtitle: string; description: string;
  accent: string; sky: string; ground: string; biome: 'city' | 'reactor' | 'canyon' | 'clouds';
  bpm: number; key: number; width: number;
  modular?: boolean;
  points?: readonly Point[];
  shape?: 'eight' | 'reactor';
  openings: { from: number; to: number; sides: readonly number[] }[];
  shortcut?: { launch: number; landing: number };
}

export const CIRCUITS: readonly CircuitDefinition[] = [
  {
    id:'nexus',name:'NEXUS RUN',subtitle:'40 CANICAS · SALIDA A META',modular:true,
    description:'Embudo con tres salidas y looping de 80 m. Bifurcaciones, saltos y túneles turbo para 40. Reaparición: 3 s.',
    accent:'#b7ff57',sky:'#102632',ground:'#132934',biome:'city',bpm:146,key:33,width:28,openings:[],
  },
  {
    id: 'neon', name: 'NEON CIRCUIT', subtitle: 'EL ORIGINAL',
    description: 'Avenidas elevadas, curvas rápidas y primeros bordes abiertos.',
    accent: '#b7ff57', sky: '#102332', ground: '#10212c', biome: 'city', bpm: 144, key: 33, width: 15,
    points: [[0,20,0],[0,18,95],[35,16,185],[125,24,230],[220,35,205],[255,28,110],
      [225,14,20],[280,12,-75],[240,22,-160],[140,36,-185],[45,30,-150],[-45,20,-195],
      [-140,16,-155],[-205,25,-70],[-165,30,5],[-85,26,-25],[-20,22,-85]],
    openings: [{from:.13,to:.18,sides:[-1]},{from:.42,to:.48,sides:[1]},{from:.7,to:.77,sides:[-1,1]}],
  },
  {
    id: 'crossfire', name: 'CROSSFIRE', subtitle: 'DOS NIVELES · UN CRUCE',
    description: 'Un ocho a dos alturas. Pasa sobre tus rivales o encuéntralos debajo.',
    accent: '#ff83ba', sky: '#241c39', ground: '#1d1930', biome: 'city', bpm: 150, key: 30, width: 16,
    shape: 'eight',
    openings: [{from:.15,to:.25,sides:[-1,1]},{from:.62,to:.75,sides:[1]}],
  },
  {
    id: 'reactor', name: 'HELIX REACTOR', subtitle: 'ESPIRAL INDUSTRIAL',
    description: 'Dos espirales entrelazadas, desniveles y curvas de largo apoyo.',
    accent: '#5ce9ef', sky: '#112a2c', ground: '#112425', biome: 'reactor', bpm: 146, key: 35, width: 16,
    shape: 'reactor',
    openings: [{from:.18,to:.31,sides:[-1]},{from:.58,to:.7,sides:[1]},{from:.78,to:.84,sides:[-1,1]}],
  },
  {
    id: 'canyon', name: 'SOLAR CANYON', subtitle: 'VELOCIDAD A CIELO ABIERTO',
    description: 'Rectas largas, eses y zonas de hielo entre agujas de roca.',
    accent: '#ffc276', sky: '#463344', ground: '#3b2833', biome: 'canyon', bpm: 140, key: 28, width: 17,
    points: [[0,36,0],[0,34,100],[60,25,190],[-20,18,290],[40,24,390],[160,40,420],
      [270,52,350],[200,46,240],[255,30,140],[200,22,10],[260,18,-100],[160,26,-200],
      [30,42,-220],[-95,55,-140],[-80,43,-40],[-30,38,-70]],
    openings: [{from:.16,to:.25,sides:[1]},{from:.48,to:.6,sides:[-1,1]},{from:.72,to:.82,sides:[-1]}],
  },
  {
    id: 'skyfall', name: 'SKYFALL', subtitle: 'LA CAÍDA ES UN ATAJO',
    description: 'Sal por el borde ámbar de la recta alta y aterriza en la pista inferior.',
    accent: '#b0a1ff', sky: '#26354a', ground: '#182c42', biome: 'clouds', bpm: 148, key: 32, width: 16,
    points: [[0,64,0],[0,64,90],[0,64,180],[70,62,260],[180,52,260],[245,38,180],
      [220,26,70],[140,18,-20],[30,18,0],[20,18,95],[20,18,190],[90,24,290],
      [-30,36,380],[-150,52,270],[-170,64,110],[-100,64,-30],[-30,64,-90]],
    openings: [{from:.035,to:.12,sides:[1]},{from:.52,to:.65,sides:[-1,1]},{from:.76,to:.82,sides:[-1]}],
    shortcut: {launch: .065, landing: .57},
  },
];

export const getCircuit = (id: string) => CIRCUITS.find(c => c.id === id) ?? CIRCUITS[0];
