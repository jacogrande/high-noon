/**
 * @high-noon/shared
 *
 * The shared game core containing deterministic simulation,
 * ECS components/systems, math utilities, and protocol definitions.
 *
 * This package runs identically on client and server.
 */

export const VERSION = '0.0.1'

// Math utilities
export * from './math'

// Simulation (ECS, components, systems)
export * from './sim'

// Network protocol types
export * from './net'
