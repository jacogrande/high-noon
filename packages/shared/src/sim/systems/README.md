# systems/

Deterministic ECS systems that run identically on client and server.

## Active Systems

- `playerInput.ts` - Per-player input mapping, roll/jump initiation
- `roll.ts` - Roll movement, i-frames, dodge hooks
- `jump.ts` - Airborne arc, landing lockout, stomp, half-wall landing pushout
- `showdown.ts` - Sheriff ability state machine
- `lastRites.ts` - Undertaker ability state machine
- `dynamite.ts` - Prospector ability lifecycle
- `cylinder.ts` - Revolver reload/fire cooldown state
- `weapon.ts` - Bullet weapon firing (jump/roll gated)
- `melee.ts` - Prospector melee combat path
- `knockback.ts` - Knockback impulse ticking
- `debugSpawn.ts` - Debug projectile spawn
- `waveSpawner.ts` - Encounter-driven enemy spawning
- `bullet.ts` - Bullet lifetime/range tracking
- `flowField.ts` - Weighted Dijkstra field (`LAVA_PATHFIND_COST` aware)
- `enemyDetection.ts` - Target acquisition + LOS
- `enemyAI.ts` - Enemy state machine transitions
- `spatialHash.ts` - Broadphase rebuild
- `slowDebuff.ts` - Slow debuff timers
- `enemySteering.ts` - Steering resolution
- `enemyAttack.ts` - Enemy attack execution
- `movement.ts` - Velocity integration + prev-position capture
- `bulletCollision.ts` - Bullet-vs-entity/tile collision resolution
- `hazardTile.ts` - Grounded lava damage-over-time
- `health.ts` - I-frames and death processing
- `goldReward.ts` - Kill reward payout (enemy strength + time scaling)
- `goldRush.ts` - Gold nugget lifetime/pickup
- `buffSystem.ts` - Timed buff bookkeeping
- `collision.ts` - Circle push-out vs tiles/entities (jump-aware half-walls)

## Canonical Order (`registerAllSystems`)

1. `playerInputSystem`
2. `rollSystem`
3. `jumpSystem`
4. `showdownSystem`
5. `lastRitesSystem`
6. `dynamiteSystem`
7. `cylinderSystem`
8. `weaponSystem`
9. `meleeSystem`
10. `knockbackSystem`
11. `debugSpawnSystem`
12. `waveSpawnerSystem`
13. `bulletSystem`
14. `flowFieldSystem`
15. `enemyDetectionSystem`
16. `enemyAISystem`
17. `spatialHashSystem`
18. `slowDebuffSystem`
19. `enemySteeringSystem`
20. `enemyAttackSystem`
21. `movementSystem`
22. `bulletCollisionSystem`
23. `hazardTileSystem`
24. `healthSystem`
25. `goldRewardSystem`
26. `goldRushSystem`
27. `buffSystem`
28. `collisionSystem`

## Multiplayer Subsets

- `registerPredictionSystems` and `registerReplaySystems` include `jumpSystem` and `hazardTileSystem` so local prediction/replay preserves jump/lava parity.
- Systems that should stay server-authoritative (enemy spawns/AI/death cleanup) are excluded from replay.
