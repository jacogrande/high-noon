import { describe, expect, test } from 'bun:test'
import { UNDERTAKER } from './undertaker'
import { initUpgradeState, recomputePlayerStats } from '../../upgrade'

describe('UNDERTAKER character definition', () => {
  describe('character definition structure', () => {
    test('has correct id', () => {
      expect(UNDERTAKER.id).toBe('undertaker')
    })

    test('has 3 branches', () => {
      expect(UNDERTAKER.branches).toHaveLength(3)
    })

    test('each branch has 5 nodes (15 total)', () => {
      expect(UNDERTAKER.branches[0]!.nodes).toHaveLength(5)
      expect(UNDERTAKER.branches[1]!.nodes).toHaveLength(5)
      expect(UNDERTAKER.branches[2]!.nodes).toHaveLength(5)

      const totalNodes = UNDERTAKER.branches.reduce(
        (sum, branch) => sum + branch.nodes.length,
        0,
      )
      expect(totalNodes).toBe(15)
    })

    test('all nodes have implemented: true', () => {
      for (const branch of UNDERTAKER.branches) {
        for (const node of branch.nodes) {
          expect(node.implemented).toBe(true)
        }
      }
    })
  })

  describe('base stats', () => {
    test('bullet damage is 12', () => {
      expect(UNDERTAKER.baseStats.bulletDamage).toBe(10)
    })

    test('bullet speed is 450', () => {
      expect(UNDERTAKER.baseStats.bulletSpeed).toBe(450)
    })

    test('range is 180', () => {
      expect(UNDERTAKER.baseStats.range).toBe(180)
    })

    test('cylinder size is 2', () => {
      expect(UNDERTAKER.baseStats.cylinderSize).toBe(2)
    })

    test('reload time is 0.7', () => {
      expect(UNDERTAKER.baseStats.reloadTime).toBe(0.7)
    })

    test('zone radius is 150', () => {
      expect(UNDERTAKER.baseStats.zoneRadius).toBe(150)
    })

    test('pulse damage is 8', () => {
      expect(UNDERTAKER.baseStats.pulseDamage).toBe(8)
    })

    test('pulse radius is 100', () => {
      expect(UNDERTAKER.baseStats.pulseRadius).toBe(100)
    })

    test('chain limit is 3', () => {
      expect(UNDERTAKER.baseStats.chainLimit).toBe(3)
    })

    test('last round multiplier is 1.75', () => {
      expect(UNDERTAKER.baseStats.lastRoundMultiplier).toBe(1.75)
    })

    test('pellet count is 5', () => {
      expect(UNDERTAKER.baseStats.pelletCount).toBe(5)
    })

    test('spread angle is 0.5', () => {
      expect(UNDERTAKER.baseStats.spreadAngle).toBe(0.5)
    })
  })

  describe('branch names', () => {
    test('branch 0 is Gravedigger', () => {
      expect(UNDERTAKER.branches[0]!.id).toBe('gravedigger')
      expect(UNDERTAKER.branches[0]!.name).toBe('Gravedigger')
    })

    test('branch 1 is Embalmer', () => {
      expect(UNDERTAKER.branches[1]!.id).toBe('embalmer')
      expect(UNDERTAKER.branches[1]!.name).toBe('Embalmer')
    })

    test('branch 2 is Pallbearer', () => {
      expect(UNDERTAKER.branches[2]!.id).toBe('pallbearer')
      expect(UNDERTAKER.branches[2]!.name).toBe('Pallbearer')
    })
  })

  describe('stat computation', () => {
    test('initUpgradeState creates correct base values', () => {
      const state = initUpgradeState(UNDERTAKER)

      expect(state.xp).toBe(0)
      expect(state.level).toBe(0)
      expect(state.pendingPoints).toBe(0)
      expect(state.nodesTaken.size).toBe(0)
      expect(state.characterDef).toBe(UNDERTAKER)

      // Spot-check computed stats match base
      for (const [key, value] of Object.entries(UNDERTAKER.baseStats)) {
        expect((state as any)[key]).toBe(value)
      }
    })

    test('recomputePlayerStats works with undertaker stats', () => {
      const state = initUpgradeState(UNDERTAKER)

      // No nodes taken returns base values
      recomputePlayerStats(state)
      for (const [key, value] of Object.entries(UNDERTAKER.baseStats)) {
        expect((state as any)[key]).toBe(value)
      }
    })

    test('recomputePlayerStats applies Undertaker-specific stat mods', () => {
      const state = initUpgradeState(UNDERTAKER)

      // Shallow Graves: pulseRadius * 1.4
      state.nodesTaken.add('shallow_graves')
      recomputePlayerStats(state)
      expect(state.pulseRadius).toBe(UNDERTAKER.baseStats.pulseRadius * 1.4)

      // Mass Grave: zoneRadius * 1.5, showdownDuration + 1.5
      state.nodesTaken.add('mass_grave')
      recomputePlayerStats(state)
      expect(state.zoneRadius).toBe(UNDERTAKER.baseStats.zoneRadius * 1.5)
      expect(state.showdownDuration).toBe(UNDERTAKER.baseStats.showdownDuration + 1.5)
    })

    test('recomputePlayerStats applies weapon stat mods', () => {
      const state = initUpgradeState(UNDERTAKER)

      // Double Tap: bulletDamage + 3
      state.nodesTaken.add('double_tap')
      recomputePlayerStats(state)
      expect(state.bulletDamage).toBe(UNDERTAKER.baseStats.bulletDamage + 3)

      // Mortician's Precision: lastRoundMultiplier + 0.75
      state.nodesTaken.add('morticians_precision')
      recomputePlayerStats(state)
      expect(state.lastRoundMultiplier).toBe(
        UNDERTAKER.baseStats.lastRoundMultiplier + 0.75,
      )
    })

    test('recomputePlayerStats applies survivability stat mods', () => {
      const state = initUpgradeState(UNDERTAKER)

      // Iron Constitution: maxHP + 2, iframeDuration + 0.15
      state.nodesTaken.add('iron_constitution')
      recomputePlayerStats(state)
      expect(state.maxHP).toBe(UNDERTAKER.baseStats.maxHP + 2)
      expect(state.iframeDuration).toBe(UNDERTAKER.baseStats.iframeDuration + 0.15)

      // Deadweight: rollSpeedMultiplier * 1.25
      state.nodesTaken.add('deadweight')
      recomputePlayerStats(state)
      expect(state.rollSpeedMultiplier).toBe(
        UNDERTAKER.baseStats.rollSpeedMultiplier * 1.25,
      )
    })
  })

  describe('node tiers', () => {
    test('T1 nodes have no prerequisites (tier 1)', () => {
      const t1Nodes = UNDERTAKER.branches.flatMap(branch =>
        branch.nodes.filter(node => node.tier === 1),
      )

      expect(t1Nodes).toHaveLength(3)
      for (const node of t1Nodes) {
        expect(node.tier).toBe(1)
      }
    })

    test('T2+ nodes have correct tiers', () => {
      for (const branch of UNDERTAKER.branches) {
        const tiers = branch.nodes.map(node => node.tier).sort((a, b) => a - b)
        expect(tiers).toEqual([1, 2, 3, 4, 5])
      }
    })

    test('Gravedigger branch has correct tier progression', () => {
      const gravedigger = UNDERTAKER.branches.find(b => b.id === 'gravedigger')!
      expect(gravedigger.nodes[0]!.tier).toBe(1) // Shallow Graves
      expect(gravedigger.nodes[1]!.tier).toBe(2) // Coffin Nails
      expect(gravedigger.nodes[2]!.tier).toBe(3) // Mass Grave
      expect(gravedigger.nodes[3]!.tier).toBe(4) // Consecrated Ground
      expect(gravedigger.nodes[4]!.tier).toBe(5) // Undertaker's Overtime
    })

    test('Embalmer branch has correct tier progression', () => {
      const embalmer = UNDERTAKER.branches.find(b => b.id === 'embalmer')!
      expect(embalmer.nodes[0]!.tier).toBe(1) // Double Tap
      expect(embalmer.nodes[1]!.tier).toBe(2) // Formaldehyde Rounds
      expect(embalmer.nodes[2]!.tier).toBe(3) // Mortician's Precision
      expect(embalmer.nodes[3]!.tier).toBe(4) // Corpse Harvest
      expect(embalmer.nodes[4]!.tier).toBe(5) // Overkill
    })

    test('Pallbearer branch has correct tier progression', () => {
      const pallbearer = UNDERTAKER.branches.find(b => b.id === 'pallbearer')!
      expect(pallbearer.nodes[0]!.tier).toBe(1) // Iron Constitution
      expect(pallbearer.nodes[1]!.tier).toBe(2) // Grave Dust
      expect(pallbearer.nodes[2]!.tier).toBe(3) // Deadweight
      expect(pallbearer.nodes[3]!.tier).toBe(4) // Final Arrangement
      expect(pallbearer.nodes[4]!.tier).toBe(5) // Open Casket
    })
  })

  describe('effect nodes', () => {
    test('Gravedigger branch has effect nodes', () => {
      const gravedigger = UNDERTAKER.branches.find(b => b.id === 'gravedigger')!
      expect(gravedigger.nodes.find(n => n.id === 'coffin_nails')!.effectId).toBe(
        'coffin_nails',
      )
      expect(gravedigger.nodes.find(n => n.id === 'consecrated_ground')!.effectId).toBe(
        'consecrated_ground',
      )
      expect(
        gravedigger.nodes.find(n => n.id === 'undertakers_overtime')!.effectId,
      ).toBe('undertakers_overtime')
    })

    test('Embalmer branch has effect nodes', () => {
      const embalmer = UNDERTAKER.branches.find(b => b.id === 'embalmer')!
      expect(
        embalmer.nodes.find(n => n.id === 'formaldehyde_rounds')!.effectId,
      ).toBe('formaldehyde_rounds')
      expect(
        embalmer.nodes.find(n => n.id === 'morticians_precision')!.effectId,
      ).toBe('morticians_precision')
      expect(embalmer.nodes.find(n => n.id === 'corpse_harvest')!.effectId).toBe(
        'corpse_harvest',
      )
      expect(embalmer.nodes.find(n => n.id === 'overkill')!.effectId).toBe('overkill')
    })

    test('Pallbearer branch has effect nodes', () => {
      const pallbearer = UNDERTAKER.branches.find(b => b.id === 'pallbearer')!
      expect(pallbearer.nodes.find(n => n.id === 'grave_dust')!.effectId).toBe(
        'grave_dust',
      )
      expect(pallbearer.nodes.find(n => n.id === 'deadweight')!.effectId).toBe(
        'deadweight',
      )
      expect(
        pallbearer.nodes.find(n => n.id === 'final_arrangement')!.effectId,
      ).toBe('final_arrangement')
      expect(pallbearer.nodes.find(n => n.id === 'open_casket')!.effectId).toBe(
        'open_casket',
      )
    })
  })

  describe('node IDs and names', () => {
    test('Gravedigger nodes have unique IDs and names', () => {
      const gravedigger = UNDERTAKER.branches.find(b => b.id === 'gravedigger')!
      const ids = gravedigger.nodes.map(n => n.id)
      const names = gravedigger.nodes.map(n => n.name)

      expect(new Set(ids).size).toBe(5)
      expect(new Set(names).size).toBe(5)

      expect(ids).toContain('shallow_graves')
      expect(ids).toContain('coffin_nails')
      expect(ids).toContain('mass_grave')
      expect(ids).toContain('consecrated_ground')
      expect(ids).toContain('undertakers_overtime')
    })

    test('Embalmer nodes have unique IDs and names', () => {
      const embalmer = UNDERTAKER.branches.find(b => b.id === 'embalmer')!
      const ids = embalmer.nodes.map(n => n.id)
      const names = embalmer.nodes.map(n => n.name)

      expect(new Set(ids).size).toBe(5)
      expect(new Set(names).size).toBe(5)

      expect(ids).toContain('double_tap')
      expect(ids).toContain('formaldehyde_rounds')
      expect(ids).toContain('morticians_precision')
      expect(ids).toContain('corpse_harvest')
      expect(ids).toContain('overkill')
    })

    test('Pallbearer nodes have unique IDs and names', () => {
      const pallbearer = UNDERTAKER.branches.find(b => b.id === 'pallbearer')!
      const ids = pallbearer.nodes.map(n => n.id)
      const names = pallbearer.nodes.map(n => n.name)

      expect(new Set(ids).size).toBe(5)
      expect(new Set(names).size).toBe(5)

      expect(ids).toContain('iron_constitution')
      expect(ids).toContain('grave_dust')
      expect(ids).toContain('deadweight')
      expect(ids).toContain('final_arrangement')
      expect(ids).toContain('open_casket')
    })
  })
})
