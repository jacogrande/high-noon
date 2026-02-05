# services/

Optional server services beyond core gameplay.

## Responsibilities

- Matchmaking logic
- Party/friend codes
- Persistence (save runs, leaderboards)
- Analytics and metrics

## Potential Services

### Matchmaking

```typescript
// Match players by skill/region
interface MatchmakingService {
  findMatch(player: Player, options: MatchOptions): Promise<RoomId>
  createPrivateMatch(hostPlayer: Player): Promise<RoomCode>
  joinByCode(player: Player, code: string): Promise<RoomId>
}
```

### Persistence

```typescript
// Save/load run progress, high scores
interface PersistenceService {
  saveRun(playerId: string, runData: RunData): Promise<void>
  loadRun(playerId: string, runId: string): Promise<RunData>
  getLeaderboard(mode: string): Promise<LeaderboardEntry[]>
}
```

### Party System

```typescript
// Group players before matching
interface PartyService {
  createParty(leader: Player): Promise<PartyCode>
  joinParty(player: Player, code: string): Promise<void>
  startMatch(partyCode: string): Promise<RoomId>
}
```

## Implementation Notes

These services are optional for initial development. Start with basic matchmaking, add complexity as needed.

Consider using Colyseus' built-in matchmaking or an external service like Nakama if you need accounts, friends, and social features.

## Dependencies

- `colyseus` - For Colyseus-native matchmaking
- Database (optional) - For persistence
