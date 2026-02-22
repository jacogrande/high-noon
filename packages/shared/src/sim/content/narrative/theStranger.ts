import { EnemyType } from '../../components'
import type { PlotThread } from './types'

export const THE_STRANGER: PlotThread = {
  id: 'the_stranger',
  name: 'The Stranger',
  premise: 'A stranger rode in with a warning. Something in the canyon is moving.',
  introCrawls: [
    'A lone rider came at dusk, ash on his coat and fear in his eyes.',
    'He left one warning on the saloon wall: do not follow canyon tracks after dark.',
    'By morning the stranger was gone, but the badlands had gone quiet in a way that felt wrong.',
  ],
  stages: [
    {
      bossPool: [EnemyType.MAD_DOG, EnemyType.BOOMSTICK, EnemyType.DALTON],
      objectiveType: 'duel',
      objectiveDescription: 'Prove you can hold your nerve when the frontier bares its teeth.',
      softFailureNext: {
        objectiveDescription: 'The stranger vanished after your loss. Keep the refugees alive until dawn.',
        unlockDialogue: 'stranger_stage1_soft',
      },
    },
    {
      bossPool: [EnemyType.COYOTE_JANE],
      objectiveType: 'protect',
      objectiveDescription: 'Protect the refugee camp while panic spreads in the dark.',
      softFailureNext: {
        objectiveDescription: 'The camp is scattered. Hunt the survivors and stop the pursuers at the pass.',
        unlockDialogue: 'stranger_stage2_soft',
      },
    },
    {
      bossPool: [EnemyType.HOLLOW_MAN],
      objectiveType: 'intercept',
      objectiveDescription: 'Intercept what stalks the canyon before it reaches open country.',
    },
  ],
  campDialogue: [
    {
      campIndex: 0,
      lines: [
        {
          key: 'stranger_camp1_success',
          speaker: 'visitor',
          text: 'You stared the dark down once. Keep your powder dry; night is only getting meaner.',
          requiresOutcome: { stage: 0, outcome: 'success' },
        },
        {
          key: 'stranger_camp1_soft',
          speaker: 'visitor',
          text: 'He rode out without a word. Whatever scared him is heading this way.',
          requiresOutcome: { stage: 0, outcome: 'soft_failure' },
        },
      ],
    },
    {
      campIndex: 1,
      lines: [
        {
          key: 'stranger_camp2_success',
          speaker: 'visitor',
          text: 'Refugees made it through. Finish this and the canyon might sleep again.',
          requiresOutcome: { stage: 1, outcome: 'success' },
        },
        {
          key: 'stranger_camp2_soft',
          speaker: 'visitor',
          text: 'Too many got separated in the dark. Last ride decides who makes it home.',
          requiresOutcome: { stage: 1, outcome: 'soft_failure' },
        },
      ],
    },
  ],
  bossTaunts: {
    [EnemyType.MAD_DOG]: 'No law out here. Only hunger.',
    [EnemyType.BOOMSTICK]: 'Even the righteous fear the canyon at night.',
    [EnemyType.DALTON]: 'Badlands make thieves of every honest man.',
    [EnemyType.COYOTE_JANE]: 'Canyon knows your name already.',
    [EnemyType.HOLLOW_MAN]: 'The canyon does not give anything back.',
  },
  resolution: {
    success: 'The warning was real, and you answered it. Dawn found the road open and the town alive.',
    softFailure: 'You held the line, but the canyon took its due. The frontier remembers every debt.',
  },
}
