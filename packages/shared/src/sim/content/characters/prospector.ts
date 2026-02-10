import type { CharacterDef } from './types'
import {
  PLAYER_HP, PLAYER_IFRAME_DURATION,
  ROLL_DURATION, ROLL_IFRAME_RATIO, ROLL_SPEED_MULTIPLIER,
} from '../player'
import {
  PICKAXE_SWING_DAMAGE, PICKAXE_SWING_RATE, PICKAXE_REACH,
  PICKAXE_CLEAVE_ARC, PICKAXE_KNOCKBACK, PICKAXE_CHARGE_TIME,
  PICKAXE_CHARGE_MULTIPLIER,
  DYNAMITE_DAMAGE, DYNAMITE_RADIUS, DYNAMITE_FUSE, DYNAMITE_COOLDOWN,
  DYNAMITE_THROW_RANGE,
  GOLD_FEVER_BONUS_PER_STACK, GOLD_FEVER_DURATION,
} from '../weapons'

/** Prospector move speed (slightly slower than Sheriff/Undertaker) */
const PROSPECTOR_SPEED = 230

export const PROSPECTOR: CharacterDef = {
  id: 'prospector',
  name: 'The Prospector',
  description: 'A grizzled miner with a pickaxe and dynamite. Wades into melee, blasts what he can\'t reach, and gets richer doing it.',
  baseStats: {
    // Bullet stats (unused by Prospector — neutral values)
    fireRate: 0,
    bulletDamage: 0,
    bulletSpeed: 0,
    range: 0,
    pelletCount: 0,
    spreadAngle: 0,
    cylinderSize: 0,
    reloadTime: 0,
    minFireInterval: 0,
    holdFireRate: 0,
    lastRoundMultiplier: 1,

    // Player stats
    speed: PROSPECTOR_SPEED,
    maxHP: PLAYER_HP,
    iframeDuration: PLAYER_IFRAME_DURATION,
    rollDuration: ROLL_DURATION,
    rollIframeRatio: ROLL_IFRAME_RATIO,
    rollSpeedMultiplier: ROLL_SPEED_MULTIPLIER,

    // Melee stats
    swingDamage: PICKAXE_SWING_DAMAGE,
    swingRate: PICKAXE_SWING_RATE,
    reach: PICKAXE_REACH,
    cleaveArc: PICKAXE_CLEAVE_ARC,
    knockback: PICKAXE_KNOCKBACK,
    chargeTime: PICKAXE_CHARGE_TIME,
    chargeMultiplier: PICKAXE_CHARGE_MULTIPLIER,

    // Dynamite stats
    dynamiteDamage: DYNAMITE_DAMAGE,
    dynamiteRadius: DYNAMITE_RADIUS,
    dynamiteFuse: DYNAMITE_FUSE,
    dynamiteCooldown: DYNAMITE_COOLDOWN,

    // Gold Rush stats
    goldFeverBonus: GOLD_FEVER_BONUS_PER_STACK,
    goldFeverDuration: GOLD_FEVER_DURATION,

    // Ability stats (reuse Showdown fields for cooldown tracking)
    showdownDuration: 0,
    showdownCooldown: 0,
    showdownKillRefund: 0,
    showdownDamageMultiplier: 1,
    showdownSpeedBonus: 1,
    showdownMarkRange: DYNAMITE_THROW_RANGE,

    // Zone stats (unused by Prospector)
    zoneRadius: 0,
    pulseDamage: 0,
    pulseRadius: 0,
    chainLimit: 0,
  },
  branches: [
    // ── Demolitions (dynamite mastery) ──
    {
      id: 'demolitions',
      name: 'Demolitions',
      description: "If it ain't broke, you ain't using enough dynamite.",
      nodes: [
        {
          id: 'extra_powder',
          name: 'Extra Powder',
          description: 'Dynamite blast radius +30%.',
          tier: 1,
          implemented: true,
          mods: [
            { stat: 'dynamiteRadius', op: 'mul', value: 1.3 },
          ],
        },
        {
          id: 'short_fuse',
          name: 'Short Fuse',
          description: 'Dynamite base fuse time reduced to 1.0s.',
          tier: 2,
          implemented: true,
          mods: [
            { stat: 'dynamiteFuse', op: 'mul', value: 0.67 },
          ],
        },
        {
          id: 'nitro',
          name: 'Nitro',
          description: 'Dynamite damage +50%. Enemies killed by dynamite explode in a secondary blast.',
          tier: 3,
          implemented: true,
          mods: [
            { stat: 'dynamiteDamage', op: 'mul', value: 1.5 },
          ],
          effectId: 'nitro',
        },
        {
          id: 'fire_in_the_hole',
          name: 'Fire in the Hole',
          description: 'Dynamite leaves a burning patch (80px, 3s, 4 DPS). Burning enemies take +20% damage.',
          tier: 4,
          implemented: false,
          mods: [],
        },
        {
          id: 'powder_keg',
          name: 'Powder Keg',
          description: '2 dynamite charges. Throwing both within 2s combines into a mega-blast.',
          tier: 5,
          implemented: false,
          mods: [],
        },
      ],
    },
    // ── Excavator (pickaxe mastery) ──
    {
      id: 'excavator',
      name: 'Excavator',
      description: 'Swing hard. Dig deep. Strike gold.',
      nodes: [
        {
          id: 'heavy_swing',
          name: 'Heavy Swing',
          description: 'Pickaxe base damage +3. Knockback +25%.',
          tier: 1,
          implemented: true,
          mods: [
            { stat: 'swingDamage', op: 'add', value: 3 },
            { stat: 'knockback', op: 'mul', value: 1.25 },
          ],
        },
        {
          id: 'tunnel_through',
          name: 'Tunnel Through',
          description: 'Charged swing pulls enemies toward you. Charged kills reset swing cooldown.',
          tier: 2,
          implemented: true,
          mods: [],
          effectId: 'tunnel_through',
        },
        {
          id: 'tremor',
          name: 'Tremor',
          description: 'Every 4th consecutive swing triggers a ground slam: 80px AoE, 50% swing damage.',
          tier: 3,
          implemented: true,
          mods: [],
          effectId: 'tremor',
        },
        {
          id: 'vein_strike',
          name: 'Vein Strike',
          description: 'Gold Fever stacks increase swing speed +5% each. At 5 stacks, charged swings release a shockwave.',
          tier: 4,
          implemented: false,
          mods: [],
        },
        {
          id: 'seismic_slam',
          name: 'Seismic Slam',
          description: 'Charged swing creates a 200px fault line. Enemies crossing take 6 DPS and 40% slow.',
          tier: 5,
          implemented: false,
          mods: [],
        },
      ],
    },
    // ── Hardrock (survivability) ──
    {
      id: 'hardrock',
      name: 'Hardrock',
      description: 'They call it hardrock mining because the rock hits back. I hit harder.',
      nodes: [
        {
          id: 'tough_as_nails',
          name: 'Tough as Nails',
          description: '+3 max HP. +0.1s i-frame duration.',
          tier: 1,
          implemented: true,
          mods: [
            { stat: 'maxHP', op: 'add', value: 3 },
            { stat: 'iframeDuration', op: 'add', value: 0.1 },
          ],
        },
        {
          id: 'brace',
          name: 'Brace',
          description: 'While charging a swing, take 30% reduced damage.',
          tier: 2,
          implemented: true,
          mods: [],
          effectId: 'brace',
        },
        {
          id: 'rockslide',
          name: 'Rockslide',
          description: 'Rolling triggers a 80px shockwave at start position, dealing 5 damage and 25% slow for 1.5s.',
          tier: 3,
          implemented: true,
          mods: [],
          effectId: 'rockslide',
        },
        {
          id: 'ore_armor',
          name: 'Ore Armor',
          description: 'Gold Fever stacks grant 5% damage reduction each. Getting hit consumes 1 stack.',
          tier: 4,
          implemented: false,
          mods: [],
        },
        {
          id: 'controlled_demolition',
          name: 'Controlled Demolition',
          description: 'No self-damage from dynamite. Below 30% HP: 3x dynamite recharge, 2x blast radius.',
          tier: 5,
          implemented: false,
          mods: [],
        },
      ],
    },
  ],
}
