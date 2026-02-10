import type { CharacterDef } from './types'
import {
  PLAYER_SPEED, PLAYER_HP, PLAYER_IFRAME_DURATION,
  ROLL_DURATION, ROLL_IFRAME_RATIO, ROLL_SPEED_MULTIPLIER,
} from '../player'
import {
  PISTOL_FIRE_RATE, PISTOL_BULLET_SPEED,
  PISTOL_BULLET_DAMAGE, PISTOL_RANGE,
  PISTOL_CYLINDER_SIZE, PISTOL_RELOAD_TIME,
  PISTOL_MIN_FIRE_INTERVAL, PISTOL_HOLD_FIRE_RATE,
  PISTOL_LAST_ROUND_MULTIPLIER, PISTOL_PELLET_COUNT, PISTOL_SPREAD_ANGLE,
  SHOWDOWN_DURATION, SHOWDOWN_COOLDOWN,
  SHOWDOWN_KILL_REFUND, SHOWDOWN_DAMAGE_MULTIPLIER,
  SHOWDOWN_SPEED_BONUS, SHOWDOWN_MARK_RANGE,
} from '../weapons'

export const SHERIFF: CharacterDef = {
  id: 'sheriff',
  name: 'The Sheriff',
  description: 'A lawman with a six-shooter and a keen eye. Masters the revolver through precision, speed, or grit.',
  baseStats: {
    fireRate: PISTOL_FIRE_RATE,
    bulletDamage: PISTOL_BULLET_DAMAGE,
    bulletSpeed: PISTOL_BULLET_SPEED,
    range: PISTOL_RANGE,
    speed: PLAYER_SPEED,
    maxHP: PLAYER_HP,
    iframeDuration: PLAYER_IFRAME_DURATION,
    rollDuration: ROLL_DURATION,
    rollIframeRatio: ROLL_IFRAME_RATIO,
    rollSpeedMultiplier: ROLL_SPEED_MULTIPLIER,
    cylinderSize: PISTOL_CYLINDER_SIZE,
    reloadTime: PISTOL_RELOAD_TIME,
    minFireInterval: PISTOL_MIN_FIRE_INTERVAL,
    holdFireRate: PISTOL_HOLD_FIRE_RATE,
    lastRoundMultiplier: PISTOL_LAST_ROUND_MULTIPLIER,
    pelletCount: PISTOL_PELLET_COUNT,
    spreadAngle: PISTOL_SPREAD_ANGLE,
    showdownDuration: SHOWDOWN_DURATION,
    showdownCooldown: SHOWDOWN_COOLDOWN,
    showdownKillRefund: SHOWDOWN_KILL_REFUND,
    showdownDamageMultiplier: SHOWDOWN_DAMAGE_MULTIPLIER,
    showdownSpeedBonus: SHOWDOWN_SPEED_BONUS,
    showdownMarkRange: SHOWDOWN_MARK_RANGE,
    zoneRadius: 0,
    pulseDamage: 0,
    pulseRadius: 0,
    chainLimit: 0,
    // Melee (unused by Sheriff)
    swingDamage: 0,
    swingRate: 0,
    reach: 0,
    cleaveArc: 0,
    knockback: 0,
    chargeTime: 0,
    chargeMultiplier: 1,
    // Dynamite (unused by Sheriff)
    dynamiteDamage: 0,
    dynamiteRadius: 0,
    dynamiteFuse: 0,
    dynamiteCooldown: 0,
    // Gold Rush (unused by Sheriff)
    goldFeverBonus: 0,
    goldFeverDuration: 0,
  },
  branches: [
    // ── Marksman (precision / showdown) ──
    {
      id: 'marksman',
      name: 'Marksman',
      description: 'Precision shooting and Showdown mastery.',
      nodes: [
        {
          id: 'steady_hand',
          name: 'Steady Hand',
          description: 'Reduced aim sway when standing still.',
          tier: 1,
          implemented: true,
          mods: [],
        },
        {
          id: 'piercing_rounds',
          name: 'Piercing Rounds',
          description: 'Bullets pass through one additional enemy.',
          tier: 2,
          implemented: true,
          mods: [],
        },
        {
          id: 'called_shot',
          name: 'Called Shot',
          description: 'Showdown lasts 2s longer and deals +50% bonus damage to marked targets.',
          tier: 3,
          implemented: true,
          mods: [
            { stat: 'showdownDuration', op: 'add', value: 2 },
            { stat: 'showdownDamageMultiplier', op: 'add', value: 0.5 },
          ],
        },
        {
          id: 'dead_to_rights',
          name: 'Dead to Rights',
          description: 'Showdown kill refund increased, allowing chain kills.',
          tier: 4,
          implemented: true,
          mods: [
            { stat: 'showdownKillRefund', op: 'add', value: 3 },
          ],
        },
        {
          id: 'judge_jury_executioner',
          name: 'Judge, Jury & Executioner',
          description: 'Showdown marks all enemies in range. Last round deals massive bonus damage.',
          tier: 5,
          implemented: true,
          mods: [],
        },
      ],
    },
    // ── Gunslinger (fire rate / cylinder) ──
    {
      id: 'gunslinger',
      name: 'Gunslinger',
      description: 'Fan the hammer and empty the cylinder with reckless speed.',
      nodes: [
        {
          id: 'fan_the_hammer',
          name: 'Fan the Hammer',
          description: 'Hold-fire rate increased by 30%.',
          tier: 1,
          implemented: true,
          mods: [
            { stat: 'holdFireRate', op: 'mul', value: 1.3 },
          ],
        },
        {
          id: 'speed_loader',
          name: 'Speed Loader',
          description: 'Reload 30% faster.',
          tier: 2,
          implemented: true,
          mods: [
            { stat: 'reloadTime', op: 'mul', value: 0.7 },
          ],
        },
        {
          id: 'hot_lead',
          name: 'Hot Lead',
          description: 'Bullets deal +25% damage but travel 15% slower.',
          tier: 3,
          implemented: true,
          mods: [
            { stat: 'bulletDamage', op: 'mul', value: 1.25 },
            { stat: 'bulletSpeed', op: 'mul', value: 0.85 },
          ],
        },
        {
          id: 'drum_cylinder',
          name: 'Drum Cylinder',
          description: 'Cylinder holds 2 extra rounds.',
          tier: 4,
          implemented: true,
          mods: [
            { stat: 'cylinderSize', op: 'add', value: 2 },
          ],
        },
        {
          id: 'dead_mans_hand',
          name: "Dead Man's Hand",
          description: 'Emptying the cylinder triggers a burst of 3 shots in a spread.',
          tier: 5,
          implemented: true,
          mods: [],
        },
      ],
    },
    // ── Lawman (survivability / mobility) ──
    {
      id: 'lawman',
      name: 'Lawman',
      description: 'Tough, resilient, and hard to pin down.',
      nodes: [
        {
          id: 'tin_star',
          name: 'Tin Star',
          description: '+2 max HP.',
          tier: 1,
          implemented: true,
          mods: [
            { stat: 'maxHP', op: 'add', value: 2 },
          ],
        },
        {
          id: 'quick_reload',
          name: 'Quick Reload',
          description: 'Reload 40% faster.',
          tier: 2,
          implemented: true,
          mods: [
            { stat: 'reloadTime', op: 'mul', value: 0.6 },
          ],
        },
        {
          id: 'iron_will',
          name: 'Iron Will',
          description: '+0.3s i-frame duration, +25% roll speed.',
          tier: 3,
          implemented: true,
          mods: [
            { stat: 'iframeDuration', op: 'add', value: 0.3 },
            { stat: 'rollSpeedMultiplier', op: 'mul', value: 1.25 },
          ],
        },
        {
          id: 'second_wind',
          name: 'Second Wind',
          description: 'Heal 1 HP on rolling through an enemy projectile.',
          tier: 4,
          implemented: true,
          mods: [],
        },
        {
          id: 'last_stand',
          name: 'Last Stand',
          description: 'At 1 HP, gain +50% damage and +20% speed for 5 seconds.',
          tier: 5,
          implemented: true,
          mods: [],
        },
      ],
    },
  ],
}
