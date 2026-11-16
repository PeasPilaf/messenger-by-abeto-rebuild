import { events } from '../../core/Events.js';
import { QUESTS, QUESTINFO, TOTAL_STEPS, anyStepInitiated, areAllQuestsCompleted } from './QuestData.js';
import { Quest } from './Quest.js';
import { SaveStore } from './SaveStore.js';

export class QuestSystem {

  constructor({ npcs = null, saveStore = new SaveStore(), wait = defaultWait } = {}) {
    this.npcs = npcs;
    this.saveStore = saveStore;
    this.wait = wait;
    this.quests = [];

    this.progress = {};
    this.anyStepInitiated = false;
    this.lastStep = null;

    events.on('quest_step_completed', this.onQuestStepCompleted, this);

    events.on('quest_completed', this.onQuestCompleted, this);

    this.init();
  }

  init() {
    const loaded = this.saveStore.loadProgress();
    this.progress = loaded.progress;
    this.anyStepInitiated = loaded.anyStepInitiated;

    this.quests = QUESTS.map((definition) => {
      const quest = new Quest({
        definition,
        completedFlags: this.progress[definition.id],

        recreateNPCBubbles: false,
      });
      this._parkCompletedNpcTexts(quest);
      return quest;
    });

    this.save();
    return this;
  }

  _parkCompletedNpcTexts(quest) {
    if (!this.npcs || quest.isQuestCompleted()) return;
    for (const step of quest.steps) {
      if (!step.completed || !Array.isArray(step.texts) || step.texts.length === 0) continue;
      const npc = this.npcs.get(step.id);
      npc?.setTexts(step.texts, step.texts.length - 1);
    }
  }

  onQuestStepCompleted(questId, stepId, index, extraData = {}) {
    const info = QUESTINFO[questId];
    if (!info) {
      console.warn(`Quest ${questId} not found!`);
      return;
    }
    info.steps[index] = true;
    this.progress[questId][index] = true;

    const isLastStep = index === info.steps.length - 1;
    const isFirstOrLast = index === 0 || isLastStep;
    const allDone = areAllQuestsCompleted(this.progress);
    this.lastStep = { questId, stepId, index, isLastStep, allDone };

    events.emit('quest_info_checklist_update', isFirstOrLast, allDone);
    this.save();

    if (allDone) {

      this.wait(1).then(() => events.emit('end_screen_show'));
    } else if (extraData.uiTitle && extraData.uiIcon && extraData.uiText && extraData.uiColor) {
      events.emit(
        'quest_box_display_after_step',
        extraData.uiTitle,
        extraData.uiIcon,
        extraData.uiText,
        extraData.uiColor,
        isLastStep,
      );
    }

    if (extraData.receiveModel) events.emit('quest_receive_model', extraData.receiveModel);

    if (isLastStep) {
      this.wait(0.9).then(() => events.emit('webgl_play_audio', 'quest-complete'));
    }
  }

  onQuestCompleted() {}

  update() {}

  save() {
    this.saveStore.writeQuestProgress(this.progress);
  }

  resetProgress() {
    for (const quest of this.quests) quest.dispose();
    this.saveStore.clear();
    this.init();
  }

  get completedSteps() {
    let done = 0;
    for (const flags of Object.values(this.progress)) done += flags.filter(Boolean).length;
    return done;
  }

  get allCompleted() {
    return areAllQuestsCompleted(this.progress);
  }

  get totalSteps() {
    return TOTAL_STEPS;
  }

  get saveJSON() {
    return this.saveStore.debugJSON();
  }

  describe() {
    return QUESTS.map((quest) => ({
      id: quest.id,
      description: quest.description,
      steps: this.progress[quest.id].map((done, index) => ({
        id: quest.steps[index].id,
        done,
      })),
    }));
  }

  dispose() {
    events.off('quest_step_completed', this.onQuestStepCompleted, this);
    events.off('quest_completed', this.onQuestCompleted, this);
    for (const quest of this.quests) quest.dispose();
  }
}

function defaultWait(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
