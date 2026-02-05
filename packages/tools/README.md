# @high-noon/tools

Development tools and asset pipeline.

## Responsibilities

- Asset pipeline scripts (sprite packing, audio processing)
- Build and export validators
- Development utilities
- Replay analysis tools

## Potential Tools

### Asset Pipeline

```bash
# Pack sprites into atlases
bun run tools:pack-sprites

# Validate asset manifest
bun run tools:validate-assets

# Generate TypeScript types from content
bun run tools:gen-content-types
```

### Development Utilities

```bash
# Start local server with hot reload
bun run tools:dev-server

# Run simulation headlessly for testing
bun run tools:headless-sim

# Analyze replay files
bun run tools:replay-analyze <file>
```

### Validation

```bash
# Check content definitions for errors
bun run tools:validate-content

# Verify determinism with replay
bun run tools:verify-determinism <replay>
```

## Directory Structure

```
src/
  pack-sprites.ts    # TexturePacker integration
  validate-assets.ts # Asset manifest validation
  gen-types.ts       # Generate types from content
  replay-tools.ts    # Replay analysis utilities
```

## Dependencies

- `@high-noon/shared` - Content definitions, replay format
- Various CLI tools (TexturePacker, ffmpeg, etc.)
