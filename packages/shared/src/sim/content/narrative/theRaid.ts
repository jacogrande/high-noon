import { EnemyType } from '../../components'
import type { PlotThread } from './types'

export const THE_RAID: PlotThread = {
  id: 'the_raid',
  name: 'The Raid',
  premise: 'A gang is raiding the town. Stop them before they burn it down.',
  introCrawls: [
    'Smoke hangs over Main Street. Riders hit the town before dawn, and the bells never stopped ringing.',
    'A gang came with torches and long guns. By sunrise, decent folk were barricaded and praying.',
    'The first shots were north of the church. If you ride now, you might still save what is left.',
  ],
  stages: [
    {
      bossPool: [EnemyType.BOOMSTICK, EnemyType.MAD_DOG, EnemyType.DALTON],
      objectiveType: 'duel',
      objectiveDescription: 'Hold the line and break the raid leaders.',
      softFailureNext: {
        objectiveDescription: 'You lost ground. Regroup and defend the outskirts before the town falls.',
        unlockDialogue: 'raid_stage1_soft',
      },
    },
    {
      bossPool: [EnemyType.COYOTE_JANE],
      objectiveType: 'protect',
      objectiveDescription: 'Defend the fleeing townsfolk while the posse regroups.',
      softFailureNext: {
        objectiveDescription: 'The gang got through your defense. Cut off their last riders in the canyon.',
        unlockDialogue: 'raid_stage2_soft',
      },
    },
    {
      bossPool: [EnemyType.HOLLOW_MAN],
      objectiveType: 'intercept',
      objectiveDescription: 'Intercept the last riders before they vanish into badland dust.',
    },
  ],
  campDialogue: [
    {
      campIndex: 0,
      lines: [
        {
          key: 'raid_camp1_success',
          speaker: 'visitor',
          text: 'You held the street, Sheriff. They are bleeding, but they are not done.',
          requiresOutcome: { stage: 0, outcome: 'success' },
        },
        {
          key: 'raid_camp1_soft',
          speaker: 'visitor',
          text: 'They punched through your line. Next ride decides whether this town survives.',
          requiresOutcome: { stage: 0, outcome: 'soft_failure' },
        },
      ],
    },
    {
      campIndex: 1,
      lines: [
        {
          key: 'raid_camp2_success',
          speaker: 'visitor',
          text: 'Their trail is thin now. One hard push and the raid breaks for good.',
          requiresOutcome: { stage: 1, outcome: 'success' },
        },
        {
          key: 'raid_camp2_soft',
          speaker: 'visitor',
          text: 'Could not stop them all. Expect desperate men and dirty tricks on the last stage.',
          requiresOutcome: { stage: 1, outcome: 'soft_failure' },
        },
      ],
    },
  ],
  bossTaunts: {
    [EnemyType.BOOMSTICK]: "The Lord's work ain't gentle, stranger.",
    [EnemyType.MAD_DOG]: 'Wrong street. Wrong day.',
    [EnemyType.DALTON]: "Two guns, one grave. That's Dalton math.",
    [EnemyType.COYOTE_JANE]: 'You made it this far? My pack will finish the job.',
    [EnemyType.HOLLOW_MAN]: 'Something in the canyon found the raiders first.',
  },
  resolution: {
    success: 'The gang scattered before sundown. The town stands, battered but breathing.',
    softFailure: 'The town survived at a cost. Some names will be read at sunrise, not supper.',
  },
}
