import { events } from '../../core/Events.js';
import { ticker } from '../../core/Ticker.js';

export class Quest {

  constructor({ definition, completedFlags = [], recreateNPCBubbles = false }) {
    this.id = definition.id;
    this.steps = definition.steps.map((step, index) => ({
      ...step,
      completed: Boolean(completedFlags[index]),
      _enabled: false,
    }));
    this.finalEvents = definition.finalEvents ?? [];
    this._recreateNPCBubbles = recreateNPCBubbles;

    this._lastTimeUpdateStep = 0;
    this._disposed = false;

    if (this.isQuestCompleted()) {

      this._finishQuest(false);
    } else {
      this._ensureElementsEnabled();
      events.on('quest_step_texts_check', this._onQuestTexts, this);
      events.on('quest_step_check', this._onQuestStep, this);
    }
  }

  isQuestCompleted(endIndex = this.steps.length) {

    const orderedAtCursor = endIndex === this.steps.length ? true : this.steps[endIndex].ordered;
    for (let index = 0; index < endIndex; index++) {
      const step = this.steps[index];
      if (!(step.completed || step.optional) && (step.ordered || orderedAtCursor)) return false;
    }
    return true;
  }

  _enableStep(step) {
    if (step._enabled) return;
    step._enabled = true;
    events.emit('quest_enable_id', step.id, step.extraData);
  }

  _ensureElementsEnabled() {
    let chainClosed = false;
    for (let index = 0; index < this.steps.length; index++) {
      const step = this.steps[index];
      if (step.completed || (step.optional && !step.ordered)) {
        this._enableStep(step);
        continue;
      }
      if (chainClosed) continue;
      this._enableStep(step);
      if (step.optional) continue;
      if (step.ordered) {
        chainClosed = true;
      } else {

        for (let later = index + 1; later < this.steps.length; later++) {
          if (this.steps[later].completed) continue;
          if (this.steps[later].ordered) chainClosed = true;
          break;
        }
      }
    }
  }

  _onQuestStep(target) {
    const id = typeof target === 'string' ? target : (target?._id ?? target?.id);
    for (let index = 0; index < this.steps.length; index++) {
      const step = this.steps[index];
      if (id !== step.id || step.completed) continue;
      const timeOk = ticker.time - this._lastTimeUpdateStep > step.minimumTimeSinceLastStep;
      const orderOk = (step.optional && !step.ordered) || this.isQuestCompleted(index);
      if (timeOk && orderOk) {
        this._lastTimeUpdateStep = ticker.time;
        step.completed = true;
        events.emit('quest_step_completed', this.id, id, index, step.extraData);
      }
      break;
    }
    if (this.isQuestCompleted()) this._finishQuest();
    else this._ensureElementsEnabled();
  }

  _onQuestTexts(npc) {
    const id = npc?._id ?? npc?.id;
    for (let index = 0; index < this.steps.length; index++) {
      const step = this.steps[index];
      if (id !== step.id || step.completed) continue;

      if (this.isQuestCompleted(index)) {
        if (typeof npc.setTexts === 'function' && Array.isArray(step.texts) && step.texts.length > 0) {
          npc.setTexts(step.texts, 0, false, this._recreateNPCBubbles);
        }
        if (step.extraData) npc.questStepExtraData = step.extraData;
      }
      break;
    }
  }

  _finishQuest(emitCompleted = true) {
    for (const step of this.steps) events.emit('quest_disable_id', step.id, step.extraData);
    this.dispose();
    if (emitCompleted) events.emit('quest_completed', this.id);
    for (const finalEvent of this.finalEvents) {
      if (finalEvent) events.emit(finalEvent);
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    events.off('quest_step_texts_check', this._onQuestTexts, this);
    events.off('quest_step_check', this._onQuestStep, this);
  }
}
