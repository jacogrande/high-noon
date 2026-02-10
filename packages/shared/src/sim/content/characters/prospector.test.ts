import { describe, expect, test } from 'bun:test'
import { PROSPECTOR } from './prospector'
import { initUpgradeState, recomputePlayerStats } from '../../upgrade'
import {
  PICKAXE_SWING_DAMAGE, PICKAXE_SWING_RATE, PICKAXE_REACH,
  PICKAXE_CLEAVE_ARC, PICKAXE_KNOCKBACK, PICKAXE_CHARGE_TIME,
  PICKAXE_CHARGE_MULTIPLIER,
  DYNAMITE_DAMAGE, DYNAMITE_RADIUS, DYNAMITE_FUSE, DYNAMITE_COOLDOWN,
  GOLD_FEVER_BONUS_PER_STACK, GOLD_FEVER_DURATION,
} from '../weapons'

describe('PROSPECTOR character definition', () => {
  describe('character definition structure', () => {
    test('has correct id', () => {
      expect(PROSPECTOR.id).toBe('prospector')
    })

    test('has 3 branches', () => {
      expect(PROSPECTOR.branches).toHaveLength(3)
    })

    test('each branch has 5 nodes (15 total)', () => {
      expect(PROSPECTOR.branches[0]!.nodes).toHaveLength(5)
      expect(PROSPECTOR.branches[1]!.nodes).toHaveLength(5)
      expect(PROSPECTOR.branches[2]!.nodes).toHaveLength(5)

      const totalNodes = PROSPECTOR.branches.reduce(
        (sum, branch) => sum + branch.nodes.length,
        0,
      )
      expect(totalNodes).toBe(15)
    })

    test('implemented nodes are correctly flagged', () => {
      const implementedIds = [
        'extra_powder', 'short_fuse', 'nitro',
        'heavy_swing', 'tunnel_through', 'tremor',
        'tough_as_nails', 'brace', 'rockslide',
      ]
      const unimplementedIds = [
        'fire_in_the_hole', 'powder_keg',
        'vein_strike', 'seismic_slam',
        'ore_armor', 'controlled_demolition',
      ]

      for (const branch of PROSPECTOR.branches) {
        for (const node of branch.nodes) {
          if (implementedIds.includes(node.id)) {
            expect(node.implemented).toBe(true)
          }
          if (unimplementedIds.includes(node.id)) {
            expect(node.implemented).toBe(false)
          }
        }
      }
    })
  })

  describe('base stats', () => {
    test('melee stats match weapon constants', () => {
      expect(PROSPECTOR.baseStats.swingDamage).toBe(PICKAXE_SWING_DAMAGE)
      expect(PROSPECTOR.baseStats.swingRate).toBe(PICKAXE_SWING_RATE)
      expect(PROSPECTOR.baseStats.reach).toBe(PICKAXE_REACH)
      expect(PROSPECTOR.baseStats.cleaveArc).toBe(PICKAXE_CLEAVE_ARC)
      expect(PROSPECTOR.baseStats.knockback).toBe(PICKAXE_KNOCKBACK)
      expect(PROSPECTOR.baseStats.chargeTime).toBe(PICKAXE_CHARGE_TIME)
      expect(PROSPECTOR.baseStats.chargeMultiplier).toBe(PICKAXE_CHARGE_MULTIPLIER)
    })

    test('dynamite stats match weapon constants', () => {
      expect(PROSPECTOR.baseStats.dynamiteDamage).toBe(DYNAMITE_DAMAGE)
      expect(PROSPECTOR.baseStats.dynamiteRadius).toBe(DYNAMITE_RADIUS)
      expect(PROSPECTOR.baseStats.dynamiteFuse).toBe(DYNAMITE_FUSE)
      expect(PROSPECTOR.baseStats.dynamiteCooldown).toBe(DYNAMITE_COOLDOWN)
    })

    test('gold rush stats match weapon constants', () => {
      expect(PROSPECTOR.baseStats.goldFeverBonus).toBe(GOLD_FEVER_BONUS_PER_STACK)
      expect(PROSPECTOR.baseStats.goldFeverDuration).toBe(GOLD_FEVER_DURATION)
    })

    test('bullet stats are zeroed (melee character)', () => {
      expect(PROSPECTOR.baseStats.fireRate).toBe(0)
      expect(PROSPECTOR.baseStats.bulletDamage).toBe(0)
      expect(PROSPECTOR.baseStats.bulletSpeed).toBe(0)
      expect(PROSPECTOR.baseStats.range).toBe(0)
      expect(PROSPECTOR.baseStats.pelletCount).toBe(0)
      expect(PROSPECTOR.baseStats.cylinderSize).toBe(0)
    })

    test('speed is 230 (slightly slower than Sheriff)', () => {
      expect(PROSPECTOR.baseStats.speed).toBe(230)
    })
  })

  describe('branch names', () => {
    test('branch 0 is Demolitions', () => {
      expect(PROSPECTOR.branches[0]!.id).toBe('demolitions')
      expect(PROSPECTOR.branches[0]!.name).toBe('Demolitions')
    })

    test('branch 1 is Excavator', () => {
      expect(PROSPECTOR.branches[1]!.id).toBe('excavator')
      expect(PROSPECTOR.branches[1]!.name).toBe('Excavator')
    })

    test('branch 2 is Hardrock', () => {
      expect(PROSPECTOR.branches[2]!.id).toBe('hardrock')
      expect(PROSPECTOR.branches[2]!.name).toBe('Hardrock')
    })
  })

  describe('tier progression', () => {
    test('each branch has tiers 1-5', () => {
      for (const branch of PROSPECTOR.branches) {
        const tiers = branch.nodes.map(node => node.tier).sort((a, b) => a - b)
        expect(tiers).toEqual([1, 2, 3, 4, 5])
      }
    })
  })

  describe('node IDs and uniqueness', () => {
    test('all 15 node IDs are unique', () => {
      const allIds = PROSPECTOR.branches.flatMap(b => b.nodes.map(n => n.id))
      expect(new Set(allIds).size).toBe(15)
    })

    test('Demolitions branch node IDs', () => {
      const ids = PROSPECTOR.branches[0]!.nodes.map(n => n.id)
      expect(ids).toContain('extra_powder')
      expect(ids).toContain('short_fuse')
      expect(ids).toContain('nitro')
      expect(ids).toContain('fire_in_the_hole')
      expect(ids).toContain('powder_keg')
    })

    test('Excavator branch node IDs', () => {
      const ids = PROSPECTOR.branches[1]!.nodes.map(n => n.id)
      expect(ids).toContain('heavy_swing')
      expect(ids).toContain('tunnel_through')
      expect(ids).toContain('tremor')
      expect(ids).toContain('vein_strike')
      expect(ids).toContain('seismic_slam')
    })

    test('Hardrock branch node IDs', () => {
      const ids = PROSPECTOR.branches[2]!.nodes.map(n => n.id)
      expect(ids).toContain('tough_as_nails')
      expect(ids).toContain('brace')
      expect(ids).toContain('rockslide')
      expect(ids).toContain('ore_armor')
      expect(ids).toContain('controlled_demolition')
    })
  })

  describe('stat computation', () => {
    test('initUpgradeState creates correct base values', () => {
      const state = initUpgradeState(PROSPECTOR)

      expect(state.xp).toBe(0)
      expect(state.level).toBe(0)
      expect(state.pendingPoints).toBe(0)
      expect(state.nodesTaken.size).toBe(0)
      expect(state.characterDef).toBe(PROSPECTOR)

      for (const [key, value] of Object.entries(PROSPECTOR.baseStats)) {
        expect((state as any)[key]).toBe(value)
      }
    })

    test('recomputePlayerStats with no nodes returns base values', () => {
      const state = initUpgradeState(PROSPECTOR)
      recomputePlayerStats(state)
      for (const [key, value] of Object.entries(PROSPECTOR.baseStats)) {
        expect((state as any)[key]).toBe(value)
      }
    })

    test('Extra Powder: dynamiteRadius * 1.3', () => {
      const state = initUpgradeState(PROSPECTOR)
      state.nodesTaken.add('extra_powder')
      recomputePlayerStats(state)
      expect(state.dynamiteRadius).toBeCloseTo(PROSPECTOR.baseStats.dynamiteRadius * 1.3)
    })

    test('Short Fuse: dynamiteFuse * 0.67', () => {
      const state = initUpgradeState(PROSPECTOR)
      state.nodesTaken.add('extra_powder')
      state.nodesTaken.add('short_fuse')
      recomputePlayerStats(state)
      expect(state.dynamiteFuse).toBeCloseTo(PROSPECTOR.baseStats.dynamiteFuse * 0.67)
    })

    test('Nitro: dynamiteDamage * 1.5', () => {
      const state = initUpgradeState(PROSPECTOR)
      state.nodesTaken.add('extra_powder')
      state.nodesTaken.add('short_fuse')
      state.nodesTaken.add('nitro')
      recomputePlayerStats(state)
      expect(state.dynamiteDamage).toBeCloseTo(PROSPECTOR.baseStats.dynamiteDamage * 1.5)
    })

    test('Heavy Swing: swingDamage + 3, knockback * 1.25', () => {
      const state = initUpgradeState(PROSPECTOR)
      state.nodesTaken.add('heavy_swing')
      recomputePlayerStats(state)
      expect(state.swingDamage).toBe(PROSPECTOR.baseStats.swingDamage + 3)
      expect(state.knockback).toBeCloseTo(PROSPECTOR.baseStats.knockback * 1.25)
    })

    test('Tough as Nails: maxHP + 3, iframeDuration + 0.1', () => {
      const state = initUpgradeState(PROSPECTOR)
      state.nodesTaken.add('tough_as_nails')
      recomputePlayerStats(state)
      expect(state.maxHP).toBe(PROSPECTOR.baseStats.maxHP + 3)
      expect(state.iframeDuration).toBeCloseTo(PROSPECTOR.baseStats.iframeDuration + 0.1)
    })
  })

  describe('effect nodes', () => {
    test('behavioral nodes have effectIds', () => {
      const nodesWithEffects = PROSPECTOR.branches.flatMap(b => b.nodes).filter(n => n.effectId)
      const effectIds = nodesWithEffects.map(n => n.effectId)

      expect(effectIds).toContain('nitro')
      expect(effectIds).toContain('tunnel_through')
      expect(effectIds).toContain('tremor')
      expect(effectIds).toContain('brace')
      expect(effectIds).toContain('rockslide')
    })
  })
})
