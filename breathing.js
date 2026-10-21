(function (root) {
  'use strict';
  const period = 4.2, tau = Math.PI * 2;
  function install(model) {
    const internal = model.internalModel;
    if (internal.enhancedBreathing) return;
    const core = internal.coreModel, parameters = core.getModel().parameters;
    function find(names) {
      for (const name of names) {
        const index = parameters.ids.indexOf(name);
        if (index >= 0) return { index, min: parameters.minimumValues[index], max: parameters.maximumValues[index] };
      }
      return null;
    }
    const breath = find(['ParamBreath', 'Breath', 'PARAM_BREATH']);
    const body = find(['ParamBodyAngleY', 'ParamBodyPitch', 'BodyPitch', 'PARAM_BODY_ANGLE_Y']);
    const head = find(['ParamAngleY', 'ParamHeadPitch', 'HeadPitch', 'PARAM_ANGLE_Y']);
    const natural = internal.updateNaturalMovements;
    let seconds = 0;
    function offset(parameter, value) {
      if (!parameter) return;
      const before = core.getParameterValueByIndex(parameter.index);
      core.setParameterValueByIndex(parameter.index, Math.max(parameter.min, Math.min(parameter.max, before + (parameter.max - parameter.min) * value)));
    }
    internal.updateNaturalMovements = function (dt, now) {
      const base = breath ? core.getParameterValueByIndex(breath.index) : 0;
      natural.call(this, dt, now);
      seconds = (seconds + Math.max(0, Math.min(dt, 100)) / 1000) % period;
      const phase = seconds * tau / period, inhale = .5 - .5 * Math.cos(phase);
      if (breath) {
        const value = base + (breath.max - base) * .96 * inhale;
        core.setParameterValueByIndex(breath.index, Math.max(breath.min, Math.min(breath.max, value)));
      }
      offset(body, -.055 * Math.cos(phase - .18));
      offset(head, -.012 * Math.cos(phase - .42));
    };
    internal.enhancedBreathing = true;
  }
  root.Live2DBreathing = { install };
})(globalThis);
