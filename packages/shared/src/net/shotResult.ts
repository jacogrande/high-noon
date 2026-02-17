export interface ShotResultMessage {
  /** Shooter entity id in server simulation space. */
  shooterServerEid: number
  /** Client shoot press-edge sequence associated with this shot (0 when unavailable). */
  shootSeq: number
  /** Authoritative server tick when the shot was resolved. */
  tick: number
  /** Whether the server confirmed at least one damaging hit. */
  hit: boolean
  /** Impact point (or ray end point on miss) in world coordinates. */
  hitX: number
  hitY: number
  /** Optional authoritative target entity id for the first confirmed hit. */
  targetServerEid?: number
  /** Optional total damage applied by the resolved shot. */
  damageApplied?: number
  /** How many ticks the server rewound for lag compensation. */
  rewindTicks?: number
  /** Whether the rewind was clamped to the maximum allowed distance. */
  rewindClamped?: boolean
  /** Server frame time in ms for the tick that resolved this shot. */
  serverFrameTimeMs?: number
}
