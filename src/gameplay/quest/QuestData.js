import questsJson from '../../data/quests.json';

export const QUESTS = questsJson.quests.map((quest) => ({
  id: quest.id,
  description: quest.description,

  finalEvents: [],
  steps: quest.steps.map((step, index) => ({
    id: step.id || `${quest.id}_${index}`,
    ordered: Boolean(step.ordered),
    optional: Boolean(step.optional),

    minimumTimeSinceLastStep:
      typeof step.minimumTimeSinceLastStep === 'number' ? step.minimumTimeSinceLastStep : -1,
    texts: Array.isArray(step.texts) ? step.texts.slice() : false,
    text: step.text ?? false,
    extraData: step.extraData ?? {},
  })),
}));

export const QUESTINFO = Object.fromEntries(
  QUESTS.map((quest) => [quest.id, {
    text: quest.description,
    steps: quest.steps.map(() => false),
  }]),
);

export const TOTAL_STEPS = QUESTS.reduce((sum, quest) => sum + quest.steps.length, 0);

export function createResetProgress() {
  const progress = {};
  for (const quest of QUESTS) progress[quest.id] = quest.steps.map(() => false);
  return progress;
}

export function areAllQuestsCompleted(progress) {
  for (const quest of QUESTS) {
    const flags = progress[quest.id];
    if (!Array.isArray(flags) || flags.length !== quest.steps.length) return false;
    if (flags.some((flag) => !flag)) return false;
  }
  return true;
}

export function anyStepInitiated(progress) {
  return QUESTS.some((quest) => (progress[quest.id] ?? []).some(Boolean));
}

export function getQuest(questId) {
  return QUESTS.find((quest) => quest.id === questId) ?? null;
}
