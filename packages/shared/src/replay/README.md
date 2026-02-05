# replay/

Deterministic replay recording and playback.

## Responsibilities

- Record player inputs with timestamps
- Store initial seeds and run configuration
- Playback recorded inputs through the simulation
- Validate determinism (compare playback results)

## Use Cases

1. **Bug reproduction** - Record a run, replay to reproduce issues
2. **Automated testing** - Verify simulation determinism
3. **Spectator mode** - Watch recorded runs
4. **Killcam/highlights** - Replay recent moments

## Recording Format

```typescript
interface Replay {
  version: number
  seed: number
  startTick: number
  inputs: InputFrame[]
}

interface InputFrame {
  tick: number
  playerId: number
  input: InputCmd
}
```

## Determinism Requirements

For replays to work, the simulation must be fully deterministic:
- Same seed → same RNG sequence
- Same inputs at same ticks → same outcomes
- No reliance on wall-clock time or external state

## Dependencies

- `../sim` - Simulation stepping
- `../net` - Input types

## Dependents

- `@high-noon/client` - Recording during play
- `@high-noon/tools` - Replay analysis tools
