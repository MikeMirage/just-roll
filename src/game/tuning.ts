// Metres/seconds, shared by the simulation and presentation. Speed changes are
// physical; the HUD always converts the measured velocity rather than scaling it.
export const DRIVE = {
  playerCruise: 58,
  botCruise: 55.5,
  turboExtra: 24,
  driveResponse: 1.9,
  cruiseAcceleration: 26,
  turboAcceleration: 52,
  braking: 20,
  steeringForce: 31,
  lateralDamping: 3.7,
  corneringLimit: 400,
  downforce: 22,
  padImpulse: 11,
  gravity: 34,
  marbleRestitution: .15,
} as const;
