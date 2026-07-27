import type { DirectorAdobeRenderPlan } from '../../../src/shared/directorAdobeContract';

function es3(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(es3).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${JSON.stringify(key)}:${es3(item)}`)
      .join(',')}}`;
  }
  return 'null';
}

function adobeFontCandidates(fontId: string, bold: boolean, italic: boolean) {
  const suffix = bold && italic ? 'BoldItalic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular';
  const families: Record<string, string[]> = {
    inter: [`Inter-${suffix}`, `Inter${suffix}`, 'Inter-Regular', 'Inter'],
    'space-grotesk': [`SpaceGrotesk-${suffix}`, `SpaceGrotesk${suffix}`, 'SpaceGrotesk-Regular', 'Space Grotesk'],
    'playfair-display': [`PlayfairDisplay-${suffix}`, `PlayfairDisplay${suffix}`, 'PlayfairDisplay-Regular', 'Playfair Display'],
    'bebas-neue': ['BebasNeue-Regular', 'Bebas Neue'],
    'jetbrains-mono': [`JetBrainsMono-${suffix}`, `JetBrainsMono${suffix}`, 'JetBrainsMono-Regular', 'JetBrains Mono'],
  };
  const fallback = bold && italic
    ? ['Arial-BoldItalicMT', 'Helvetica-BoldOblique', 'ArialMT', 'Helvetica']
    : bold
      ? ['Arial-BoldMT', 'Helvetica-Bold', 'ArialMT', 'Helvetica']
      : italic
        ? ['Arial-ItalicMT', 'Helvetica-Oblique', 'ArialMT', 'Helvetica']
        : ['ArialMT', 'Helvetica'];
  return [...(families[fontId] ?? []), ...fallback];
}

/**
 * Build one deterministic ExtendScript transaction for the existing Adobe
 * MCP's execute_extend_script tool. The transaction queues and saves the
 * project; the trusted local Director service may then run that exact item
 * through aerender without holding the MCP socket open.
 *
 * Exact Director-native effects are strict. Built-in AE translations report
 * whether they are exact editorial equivalents or visual approximations.
 */
export function buildDirectorAfterEffectsScript(
  plan: DirectorAdobeRenderPlan,
  absoluteMediaPaths: Record<string, string>,
  outputPath: string,
  projectSavePath?: string,
) {
  const clips = plan.timeline.clips.map((clip, index) => ({
    ...clip,
    index,
    path: absoluteMediaPaths[clip.mediaId],
    textLayers: clip.textLayers.map((textLayer) => ({
      ...textLayer,
      adobeFontCandidates: adobeFontCandidates(
        textLayer.style.fontId,
        textLayer.style.weight === 'bold',
        textLayer.style.italic,
      ),
    })),
  }));
  const audio = plan.media.find((entry) => entry.kind === 'audio');
  const audioPath = audio ? absoluteMediaPaths[audio.id] : null;
  if (clips.some((clip) => !clip.path)) {
    throw new Error('The Adobe handoff is missing one or more clip media files.');
  }
  if (audio && !audioPath) throw new Error('The Adobe handoff is missing its audio media file.');

  const beatsEnabled = plan.timeline.beats.enabled && audioPath !== null;
  const pixelSortContract = plan.effectContracts.pixelSort;
  const beatSyncContract = plan.effectContracts.beatSync;
  const outputProfiles = [{
    tier: 'preferred',
    codec: plan.output.codec,
    bitDepth: plan.output.bitDepth,
    colorSpace: plan.output.colorSpace,
    postProcess: null,
    candidates: plan.output.outputModuleTemplateCandidates,
  }, ...plan.output.fallbackOutputModuleProfiles.map((profile) => ({
    tier: 'compatible-fallback',
    codec: profile.codec,
    bitDepth: profile.bitDepth,
    colorSpace: profile.colorSpace,
    postProcess: profile.postProcess,
    candidates: profile.outputModuleTemplateCandidates,
  }))];

  return `
return (function () {
  app.beginUndoGroup(${JSON.stringify(`Director Adobe — ${plan.title}`)});
  var result = {
    status: "building",
    composition: null,
    media: [],
    motions: [],
    transitions: [],
    grades: [],
    effects: [],
    textLayers: [],
    beatSync: null,
    approximations: [],
    warnings: [],
    removedStaleQueueItems: 0,
    renderQueueIndex: null,
    outputModuleTemplate: null,
    outputModuleTier: null,
    outputCodec: null,
    outputBitDepth: null,
    outputColorSpace: null,
    outputPostProcess: null,
    projectPath: null,
    projectSaveMode: null
  };
  var comp = null;
  var renderItem = null;
  var projectItemIdsBefore = {};
  var originalBitsPerChannel = null;
  var originalWorkingSpace = null;
  try {
    var project = app.project;
    if (!project) throw new Error("After Effects has no open project.");
    for (var initialItemIndex = 1; initialItemIndex <= project.numItems; initialItemIndex++) {
      projectItemIdsBefore[String(project.item(initialItemIndex).id)] = true;
    }
    originalBitsPerChannel = project.bitsPerChannel;
    originalWorkingSpace = project.workingSpace;
    project.bitsPerChannel = ${plan.composition.bitsPerChannel};
    if (project.bitsPerChannel !== 32) throw new Error("Director Adobe requires a 32-bpc project.");
    try {
      project.workingSpace = ${JSON.stringify(plan.composition.workingSpace)};
    } catch (workingSpaceError) {
      throw new Error("Director could not set the required working space: " + workingSpaceError.toString());
    }
    if (project.workingSpace !== ${JSON.stringify(plan.composition.workingSpace)}) {
      throw new Error("Director requires working space ${plan.composition.workingSpace}; After Effects reported " + project.workingSpace + ".");
    }

    comp = project.items.addComp(
      ${JSON.stringify(plan.composition.name)},
      ${plan.composition.width},
      ${plan.composition.height},
      ${plan.composition.pixelAspect},
      ${plan.composition.durationSeconds},
      ${plan.composition.frameRate}
    );
    comp.motionBlur = true;
    comp.shutterAngle = 180;
    result.composition = {
      id: String(comp.id),
      name: comp.name,
      width: comp.width,
      height: comp.height,
      frameRate: comp.frameRate,
      duration: comp.duration,
      bitsPerChannel: project.bitsPerChannel,
      workingSpace: project.workingSpace
    };

    function clamp(value, minimum, maximum) {
      return Math.min(maximum, Math.max(minimum, value));
    }

    function valueOr(object, name, fallback) {
      return object && object[name] !== undefined ? object[name] : fallback;
    }

    function arrayContains(items, value) {
      for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
        if (items[itemIndex] === value) return true;
      }
      return false;
    }

    function importFootage(path) {
      var file = new File(path);
      if (!file.exists) throw new Error("Missing handoff media: " + path);
      for (var itemIndex = 1; itemIndex <= project.numItems; itemIndex++) {
        var existing = project.item(itemIndex);
        if (existing instanceof FootageItem && existing.mainSource && existing.mainSource.file &&
            existing.mainSource.file.fsName === file.fsName) return existing;
      }
      var imported = project.importFile(new ImportOptions(file));
      return imported;
    }

    function effectParade(layer) {
      return layer.property("ADBE Effect Parade");
    }

    function tryAddEffect(layer, matchName, label) {
      try {
        var effect = effectParade(layer).addProperty(matchName);
        if (effect !== null && label) effect.name = label;
        return effect;
      } catch (effectError) {
        result.warnings.push("Could not add " + label + " (" + matchName + "): " + effectError.toString());
        return null;
      }
    }

    function findEffectProperty(effect, names) {
      if (effect === null) return null;
      for (var nameIndex = 0; nameIndex < names.length; nameIndex++) {
        try {
          var property = effect.property(names[nameIndex]);
          if (property !== null) return property;
        } catch (propertyError) {}
      }
      return null;
    }

    function setEffectValue(effect, names, value) {
      var property = findEffectProperty(effect, names);
      if (property === null) return false;
      try {
        property.setValue(value);
        return true;
      } catch (setEffectError) {
        return false;
      }
    }

    function keyEffectValue(effect, names, time, value) {
      var property = findEffectProperty(effect, names);
      if (property === null) return false;
      try {
        property.setValueAtTime(time, value);
        return true;
      } catch (keyEffectError) {
        return false;
      }
    }

    function easeProperty(property) {
      if (property === null || property.numKeys < 1) return;
      for (var keyIndex = 1; keyIndex <= property.numKeys; keyIndex++) {
        try {
          var dimensions = (property.value instanceof Array) ? property.value.length : 1;
          var easeIn = [];
          var easeOut = [];
          for (var dimension = 0; dimension < dimensions; dimension++) {
            easeIn.push(new KeyframeEase(0, 66));
            easeOut.push(new KeyframeEase(0, 66));
          }
          property.setTemporalEaseAtKey(keyIndex, easeIn, easeOut);
        } catch (easeError) {}
      }
    }

    function setTwoKeys(property, startTime, startValue, endTime, endValue) {
      property.setValueAtTime(startTime, startValue);
      property.setValueAtTime(endTime, endValue);
      easeProperty(property);
    }

    function setThreeKeys(property, firstTime, firstValue, middleTime, middleValue, lastTime, lastValue) {
      property.setValueAtTime(firstTime, firstValue);
      property.setValueAtTime(middleTime, middleValue);
      property.setValueAtTime(lastTime, lastValue);
      easeProperty(property);
    }

    function centerAndFit(layer) {
      var source = layer.source;
      var scale = 100;
      if (source && source.width && source.height) {
        scale = Math.max(comp.width / source.width, comp.height / source.height) * 100;
      }
      var transform = layer.property("ADBE Transform Group");
      transform.property("ADBE Scale").setValue([scale, scale]);
      transform.property("ADBE Position").setValue([comp.width / 2, comp.height / 2]);
      return { scale: scale, position: [comp.width / 2, comp.height / 2] };
    }

    function addBeatMapLayer(name) {
      var layer = comp.layers.addNull();
      layer.name = name;
      layer.guideLayer = true;
      layer.enabled = true;
      return layer;
    }

    function applyMotion(layer, item, base) {
      var motion = item.motion;
      var transform = layer.property("ADBE Transform Group");
      var position = transform.property("ADBE Position");
      var scale = transform.property("ADBE Scale");
      var rotation = transform.property("ADBE Rotate Z");
      var start = item.startSeconds;
      var end = Math.min(comp.duration, item.startSeconds + item.durationSeconds);
      var middle = start + (end - start) / 2;
      var amount = 0.45 + clamp(item.intensity, 0, 100) / 180;
      var scaleGain = 1 + 0.08 * amount;
      var spanX = comp.width * 0.055 * amount;
      var spanY = comp.height * 0.04 * amount;
      var mode = "native-transform";

      if (motion === "still") mode = "exact-no-op";
      else if (motion === "push-in" || motion === "slow-push") {
        setTwoKeys(scale, start, [base.scale, base.scale], end, [base.scale * scaleGain, base.scale * scaleGain]);
      } else if (motion === "pull-out" || motion === "slow-pull") {
        setTwoKeys(scale, start, [base.scale * (scaleGain + 0.04), base.scale * (scaleGain + 0.04)], end, [base.scale, base.scale]);
      } else if (motion === "pan-left") {
        scale.setValue([base.scale * 1.09, base.scale * 1.09]);
        setTwoKeys(position, start, [base.position[0] + spanX, base.position[1]], end, [base.position[0] - spanX, base.position[1]]);
      } else if (motion === "pan-right") {
        scale.setValue([base.scale * 1.09, base.scale * 1.09]);
        setTwoKeys(position, start, [base.position[0] - spanX, base.position[1]], end, [base.position[0] + spanX, base.position[1]]);
      } else if (motion === "pan-up") {
        scale.setValue([base.scale * 1.09, base.scale * 1.09]);
        setTwoKeys(position, start, [base.position[0], base.position[1] + spanY], end, [base.position[0], base.position[1] - spanY]);
      } else if (motion === "pan-down") {
        scale.setValue([base.scale * 1.09, base.scale * 1.09]);
        setTwoKeys(position, start, [base.position[0], base.position[1] - spanY], end, [base.position[0], base.position[1] + spanY]);
      } else if (motion === "drift-up-left") {
        scale.setValue([base.scale * 1.08, base.scale * 1.08]);
        setTwoKeys(position, start, [base.position[0] + spanX, base.position[1] + spanY], end, [base.position[0] - spanX, base.position[1] - spanY]);
      } else if (motion === "drift-down-right" || motion === "drift-diagonal") {
        setTwoKeys(scale, start, [base.scale * 1.06, base.scale * 1.06], end, [base.scale * 1.1, base.scale * 1.1]);
        setTwoKeys(position, start, [base.position[0] - spanX, base.position[1] - spanY], end, [base.position[0] + spanX, base.position[1] + spanY]);
      } else if (motion === "pulse") {
        setThreeKeys(scale, start, [base.scale, base.scale], middle, [base.scale * (scaleGain + 0.02), base.scale * (scaleGain + 0.02)], end, [base.scale, base.scale]);
      } else if (motion === "hero-push") {
        setTwoKeys(scale, start, [base.scale, base.scale], end, [base.scale * 1.18, base.scale * 1.18]);
        setTwoKeys(position, start, base.position, end, [base.position[0], base.position[1] + spanY]);
      } else if (motion === "arc-left" || motion === "arc-right") {
        var direction = motion === "arc-left" ? -1 : 1;
        setThreeKeys(position, start, [base.position[0] - direction * spanX, base.position[1] + spanY * 0.5], middle, [base.position[0], base.position[1] - spanY], end, [base.position[0] + direction * spanX, base.position[1] + spanY * 0.5]);
        setThreeKeys(scale, start, [base.scale * 1.04, base.scale * 1.04], middle, [base.scale * 1.1, base.scale * 1.1], end, [base.scale * 1.04, base.scale * 1.04]);
      } else if (motion === "float") {
        setThreeKeys(position, start, [base.position[0] - spanX, base.position[1]], middle, [base.position[0] + spanX, base.position[1] - spanY], end, [base.position[0] - spanX, base.position[1]]);
        setThreeKeys(scale, start, [base.scale * 1.05, base.scale * 1.05], middle, [base.scale * 1.1, base.scale * 1.1], end, [base.scale * 1.05, base.scale * 1.05]);
      } else if (motion === "tilt-parallax") {
        setTwoKeys(scale, start, [base.scale * 1.05, base.scale * 1.05], end, [base.scale * 1.08, base.scale * 1.08]);
        setTwoKeys(position, start, [base.position[0] - spanX * 0.5, base.position[1] + spanY * 0.5], end, [base.position[0] + spanX * 0.5, base.position[1] - spanY * 0.5]);
        setTwoKeys(rotation, start, -0.35, end, 0.35);
      } else if (motion === "apex-shake") {
        var motionParams = item.pluginParams[motion] || {};
        var apex = clamp(valueOr(motionParams, "apex", 0.5), 0, 1);
        var amplitude = clamp(valueOr(motionParams, "amplitude", 0.03), 0, 0.08);
        var apexTime = start + (end - start) * apex;
        position.setValueAtTime(start, base.position);
        position.setValueAtTime(Math.max(start, apexTime - 0.06), [base.position[0] - comp.width * amplitude, base.position[1] + comp.height * amplitude]);
        position.setValueAtTime(apexTime, [base.position[0] + comp.width * amplitude, base.position[1] - comp.height * amplitude]);
        position.setValueAtTime(Math.min(end, apexTime + 0.06), [base.position[0] - comp.width * amplitude * 0.5, base.position[1] + comp.height * amplitude * 0.5]);
        position.setValueAtTime(end, base.position);
        easeProperty(position);
        scale.setValue([base.scale * 1.06, base.scale * 1.06]);
      } else {
        mode = "unsupported";
        result.warnings.push("No After Effects motion mapping exists for " + motion + ".");
      }
      result.motions.push({ clipId: item.clipId, id: motion, mode: mode, precisionBits: 32 });
    }

    function applyGrade(layer, item, gradeId) {
      var amount = clamp(item.intensity, 0, 100);
      var effect = null;
      var appliedAny = false;
      var mode = "native-approximation";
      if (gradeId === "clean") mode = "exact-no-op";
      else if (gradeId === "mono") {
        // Tint is 32-bpc aware; Black & White would lower this part of the
        // pipeline to 16 bpc even inside a 32-bpc composition.
        effect = tryAddEffect(layer, "ADBE Tint", "Director Grade — Monochrome");
        appliedAny = effect !== null;
        if (effect !== null) setEffectValue(effect, ["ADBE Tint-0003", "Amount to Tint"], 100);
        mode = effect === null ? "unavailable" : "native-equivalent";
      } else if (gradeId === "warm" || gradeId === "cool" || gradeId === "teal-orange") {
        effect = tryAddEffect(layer, "ADBE PhotoFilterPS", "Director Grade — " + gradeId);
        appliedAny = effect !== null;
        if (effect !== null) {
          setEffectValue(effect, ["ADBE PhotoFilterPS-0003", "Density"], Math.max(8, amount * 0.45));
          if (gradeId === "warm") setEffectValue(effect, ["ADBE PhotoFilterPS-0002", "Color"], [1, 0.55, 0.2]);
          else if (gradeId === "cool") setEffectValue(effect, ["ADBE PhotoFilterPS-0002", "Color"], [0.2, 0.55, 1]);
          else setEffectValue(effect, ["ADBE PhotoFilterPS-0002", "Color"], [0.1, 0.7, 0.72]);
        }
      } else if (gradeId === "cinematic" || gradeId === "hdr" || gradeId === "punch") {
        // Hue/Saturation preserves 32-bpc processing; Vibrance is only 16-bpc.
        effect = tryAddEffect(layer, "ADBE HUE SATURATION", "Director Grade — " + gradeId);
        appliedAny = effect !== null;
        if (effect !== null) {
          setEffectValue(
            effect,
            ["ADBE HUE SATURATION-0005", "Master Saturation"],
            gradeId === "cinematic" ? -amount * 0.08 : amount * 0.12
          );
        }
        var exposure = tryAddEffect(layer, "ADBE Exposure2", "Director Grade Detail — " + gradeId);
        appliedAny = appliedAny || exposure !== null;
        if (exposure !== null) setEffectValue(exposure, ["ADBE Exposure2-0005", "Gamma Correction", "Gamma"], gradeId === "hdr" ? 0.92 : 0.96);
      } else if (gradeId === "vintage-film" || gradeId === "dream" || gradeId === "bleach-bypass") {
        effect = tryAddEffect(layer, "ADBE HUE SATURATION", "Director Grade — " + gradeId);
        appliedAny = effect !== null;
        if (effect !== null) {
          setEffectValue(effect, ["ADBE HUE SATURATION-0005", "Master Saturation"], gradeId === "bleach-bypass" ? -55 : -18);
          setEffectValue(effect, ["ADBE HUE SATURATION-0006", "Master Lightness"], gradeId === "dream" ? 5 : 0);
        }
        if (gradeId === "vintage-film") {
          var grain = tryAddEffect(layer, "ADBE Noise", "Director Vintage Grain");
          appliedAny = appliedAny || grain !== null;
          if (grain !== null) setEffectValue(grain, ["ADBE Noise-0001", "Amount of Noise"], amount * 0.08);
        }
      } else if (gradeId === "vignette" || gradeId === "blur" || gradeId === "glow") {
        var gradeMatch = gradeId === "blur" ? "ADBE Gaussian Blur 2" : gradeId === "glow" ? "ADBE Glo2" : "ADBE Exposure2";
        effect = tryAddEffect(layer, gradeMatch, "Director Compatibility Grade — " + gradeId);
        appliedAny = effect !== null;
        if (gradeId === "blur" && effect !== null) setEffectValue(effect, ["ADBE Gaussian Blur 2-0001", "Blurriness"], amount * 0.08);
        if (gradeId === "glow" && effect !== null) setEffectValue(effect, ["ADBE Glo2-0004", "Glow Intensity"], 0.25 + amount / 180);
        if (gradeId === "vignette") result.warnings.push("The retired vignette grade uses an exposure approximation in After Effects.");
      } else {
        mode = "unsupported";
        result.warnings.push("No After Effects grade mapping exists for " + gradeId + ".");
      }
      if (mode === "native-approximation" && !appliedAny) mode = "unavailable";
      if (mode === "native-approximation") result.approximations.push({ type: "grade", id: gradeId, clipId: item.clipId });
      result.grades.push({ clipId: item.clipId, id: gradeId, mode: mode, precisionBits: 32 });
    }

    function applyVisualEffect(layer, item, effectId, pixelSortEffects) {
      var params = item.pluginParams[effectId] || {};
      var amount = clamp(valueOr(params, "intensity", item.intensity), 0, 100);
      var effect = null;
      var mode = "native-approximation";
      if (effectId === "pixel-sort") {
        try { effect = effectParade(layer).addProperty(${JSON.stringify(pixelSortContract.id)}); } catch (pixelSortError) {}
        if (effect !== null) {
          effect.name = ${JSON.stringify(pixelSortContract.displayName)};
          setEffectValue(effect, ["Intensity"], amount);
          setEffectValue(effect, ["Phase"], valueOr(params, "phase", 100));
          setEffectValue(effect, ["Seed"], valueOr(params, "seed", item.index + 1));
          pixelSortEffects.push({
            clipId: item.clipId,
            layer: layer,
            effectName: ${JSON.stringify(pixelSortContract.displayName)},
            beatPropertyNames: [${JSON.stringify(pixelSortContract.beatAmountParameter)}],
            mode: "director-native"
          });
          mode = "director-native";
        } else {
          throw new Error(
            ${JSON.stringify(`${pixelSortContract.displayName} has no exact prepared plate for clip `)} +
            item.title + ${JSON.stringify(' and the native After Effects effect is not installed. Director refuses to substitute blur for pixel sorting.')}
          );
        }
      } else if (effectId === "glitch-burst" || effectId === "chromatic-aberration") {
        effect = tryAddEffect(layer, "ADBE Motion Blur", "Director Approximation — " + effectId);
        if (effect !== null) {
          setEffectValue(effect, ["ADBE Motion Blur-0001", "Direction"], 90);
          setEffectValue(effect, ["ADBE Motion Blur-0002", "Blur Length"], amount * 0.18);
        }
      } else if (effectId === "crt-scan" || effectId === "film-grain") {
        effect = tryAddEffect(layer, "ADBE Noise", "Director Approximation — " + effectId);
        if (effect !== null) setEffectValue(effect, ["ADBE Noise-0001", "Amount of Noise"], amount * (effectId === "crt-scan" ? 0.18 : 0.35));
      } else if (effectId === "ripple-drift" || effectId === "liquid-melt") {
        effect = tryAddEffect(layer, "ADBE Turbulent Displace", "Director Approximation — " + effectId);
        if (effect !== null) {
          setEffectValue(effect, ["ADBE Turbulent Displace-0002", "Amount"], amount * 0.3);
          setEffectValue(effect, ["ADBE Turbulent Displace-0003", "Size"], Math.max(12, comp.width * 0.04));
        }
      } else if (effectId === "motion-echo") {
        effect = tryAddEffect(layer, "ADBE Echo", "Director Approximation — Motion Echo");
        if (effect !== null) {
          setEffectValue(effect, ["ADBE Echo-0001", "Echo Time (seconds)", "Echo Time"], -1 / comp.frameRate);
          setEffectValue(effect, ["ADBE Echo-0002", "Number Of Echoes", "Number of Echoes"], Math.max(2, Math.round(amount / 18)));
          setEffectValue(effect, ["ADBE Echo-0004", "Decay"], 0.55);
        }
      } else if (effectId === "threshold-melt") {
        effect = tryAddEffect(layer, "ADBE Threshold2", "Director Approximation — Threshold Melt");
        if (effect !== null) setEffectValue(effect, ["ADBE Threshold2-0001", "Level"], 110 + amount * 0.35);
      } else if (effectId === "halation-bloom" || effectId === "anamorphic-streak") {
        effect = tryAddEffect(layer, "ADBE Glo2", "Director Approximation — " + effectId);
        if (effect !== null) {
          setEffectValue(effect, ["ADBE Glo2-0002", "Glow Threshold"], clamp(valueOr(params, "threshold", 66), 0, 100));
          setEffectValue(effect, ["ADBE Glo2-0003", "Glow Radius"], effectId === "anamorphic-streak" ? amount * 1.8 : amount * 0.65);
          setEffectValue(effect, ["ADBE Glo2-0004", "Glow Intensity"], 0.2 + amount / 120);
        }
      } else if (effectId === "tilt-shift") {
        effect = tryAddEffect(layer, "ADBE Gaussian Blur 2", "Director Approximation — Tilt Shift");
        if (effect !== null) setEffectValue(effect, ["ADBE Gaussian Blur 2-0001", "Blurriness"], amount * 0.15);
      } else if (effectId === "neon-edge") {
        // Cartoon and Glow both preserve the composition's 32-bpc precision;
        // Find Edges would reduce this effect stage to 8 bpc.
        effect = tryAddEffect(layer, "ADBE Cartoonify", "Director Approximation — Neon Edge");
        if (effect !== null) {
          setEffectValue(effect, ["ADBE Cartoonify-0001", "Render"], 2);
          setEffectValue(effect, ["ADBE Cartoonify-0009", "Threshold"], 1.2 + amount * 0.018);
          setEffectValue(effect, ["ADBE Cartoonify-0010", "Width"], 0.8 + amount * 0.035);
          setEffectValue(effect, ["ADBE Cartoonify-0011", "Softness"], 35);
          setEffectValue(effect, ["ADBE Cartoonify-0012", "Opacity"], 65 + amount * 0.35);
        }
        var neonGlow = tryAddEffect(layer, "ADBE Glo2", "Director Neon Glow");
        if (neonGlow !== null) {
          setEffectValue(neonGlow, ["ADBE Glo2-0002", "Glow Threshold"], 55);
          setEffectValue(neonGlow, ["ADBE Glo2-0003", "Glow Radius"], 8 + amount * 0.32);
          setEffectValue(neonGlow, ["ADBE Glo2-0004", "Glow Intensity"], 0.4 + amount / 160);
          effect = neonGlow;
        }
      } else if (effectId === "vignette-breathe") {
        effect = tryAddEffect(layer, "ADBE Exposure2", "Director Approximation — Vignette Breathe");
        if (effect !== null) {
          keyEffectValue(effect, ["ADBE Exposure2-0003", "Exposure"], item.startSeconds, -amount / 260);
          keyEffectValue(effect, ["ADBE Exposure2-0003", "Exposure"], item.startSeconds + item.durationSeconds / 2, 0);
          keyEffectValue(effect, ["ADBE Exposure2-0003", "Exposure"], Math.min(comp.duration, item.startSeconds + item.durationSeconds), -amount / 260);
        }
      } else if (effectId === "light-leak") {
        effect = tryAddEffect(layer, "ADBE Glo2", "Director Approximation — Light Leak");
        if (effect !== null) {
          setEffectValue(effect, ["ADBE Glo2-0002", "Glow Threshold"], 40);
          setEffectValue(effect, ["ADBE Glo2-0003", "Glow Radius"], amount);
          setEffectValue(effect, ["ADBE Glo2-0004", "Glow Intensity"], amount / 95);
        }
      } else if (effectId === "halftone-print" || effectId === "halftone-reveal") {
        // CC HexTile is a coarser approximation than CC Ball Action, but unlike
        // Ball Action it keeps this 32-bpc master path in floating point.
        effect = tryAddEffect(layer, "CS HexTile", "Director Approximation — " + effectId);
        if (effect !== null) {
          setEffectValue(effect, ["CS HexTile-0002", "Radius"], Math.max(3, comp.width * valueOr(params, "cellSize", 0.014)));
          setEffectValue(effect, ["CS HexTile-0005", "Rotate"], effectId === "halftone-print" ? 30 : 0);
          setEffectValue(effect, ["CS HexTile-0006", "Smearing"], -(15 + amount * 0.35));
        }
      } else {
        mode = "unsupported";
        result.warnings.push("No After Effects visual-effect mapping exists for " + effectId + ".");
      }
      if (effectId !== "pixel-sort") {
        if (mode === "native-approximation" && effect === null) mode = "unavailable";
        if (mode === "native-approximation") result.approximations.push({ type: "effect", id: effectId, clipId: item.clipId });
      }
      result.effects.push({
        clipId: item.clipId,
        id: effectId,
        contract: effectId === "pixel-sort" ? ${JSON.stringify(pixelSortContract.id)} : null,
        mode: mode,
        installed: effect !== null,
        nativeInstalled: effectId === "pixel-sort" ? mode === "director-native" : null,
        precisionBits: 32
      });
    }

    function applyTransition(layer, previousLayer, item, base) {
      var transition = item.transition;
      // incomingOverlapSeconds is the compiler's clamped, executable overlap;
      // transitionDurationSeconds is only the user's requested duration.
      var duration = Math.min(item.incomingOverlapSeconds, item.durationSeconds);
      var start = item.startSeconds;
      var end = Math.min(comp.duration, start + duration);
      var mode = "native-equivalent";

      // Keep transition animation in a separate 32-bpc Transform effect.
      // Reusing the layer transform would overwrite Director camera-motion
      // keyframes when both systems animate Position or Scale.
      function transitionTransform(target, label) {
        var transformEffect = tryAddEffect(target, "ADBE Geometry2", label);
        if (transformEffect === null) {
          throw new Error("Director could not add the 32-bpc Transform effect required for " + transition + ".");
        }
        return {
          opacity: findEffectProperty(transformEffect, ["ADBE Geometry2-0008", "Opacity"]),
          position: findEffectProperty(transformEffect, ["ADBE Geometry2-0002", "Position"]),
          scaleHeight: findEffectProperty(transformEffect, ["ADBE Geometry2-0003", "Scale Height"]),
          scaleWidth: findEffectProperty(transformEffect, ["ADBE Geometry2-0004", "Scale Width"])
        };
      }

      if (transition === "cut" || duration <= 0) mode = "exact-no-op";
      else if (transition === "crossfade") {
        var crossfadeTransform = transitionTransform(layer, "Director Transition — Crossfade");
        setTwoKeys(crossfadeTransform.opacity, start, 0, end, 100);
      }
      else if (transition === "soft-dissolve") {
        var softTransform = transitionTransform(layer, "Director Transition — Soft Dissolve");
        setTwoKeys(softTransform.opacity, start, 0, end, 100);
        var blur = tryAddEffect(layer, "ADBE Gaussian Blur 2", "Director Soft Dissolve");
        if (blur !== null) {
          keyEffectValue(blur, ["ADBE Gaussian Blur 2-0001", "Blurriness"], start, 12);
          keyEffectValue(blur, ["ADBE Gaussian Blur 2-0001", "Blurriness"], end, 0);
        }
        mode = "native-approximation";
      } else if (transition === "dip-black" || transition === "dip-to") {
        var middle = start + duration / 2;
        if (previousLayer !== null) {
          var previousTransform = transitionTransform(previousLayer, "Director Transition Out — " + transition);
          setTwoKeys(previousTransform.opacity, start, 100, middle, 0);
        }
        var dipTransform = transitionTransform(layer, "Director Transition In — " + transition);
        dipTransform.opacity.setValueAtTime(start, 0);
        dipTransform.opacity.setValueAtTime(middle, 0);
        dipTransform.opacity.setValueAtTime(end, 100);
        easeProperty(dipTransform.opacity);
        if (transition === "dip-to") mode = "native-approximation";
      } else if (transition === "slide-left" || transition === "slide-right") {
        var direction = transition === "slide-left" ? 1 : -1;
        var slideTransform = transitionTransform(layer, "Director Transition — " + transition);
        var slidePosition = slideTransform.position.value;
        var slideDistance = comp.width * 100 / Math.max(0.001, base.scale);
        setTwoKeys(
          slideTransform.position,
          start,
          [slidePosition[0] + direction * slideDistance, slidePosition[1]],
          end,
          slidePosition
        );
      } else if (transition === "zoom") {
        var zoomTransform = transitionTransform(layer, "Director Transition — Zoom");
        setTwoKeys(zoomTransform.opacity, start, 0, end, 100);
        setTwoKeys(zoomTransform.scaleHeight, start, 122, end, 100);
        setTwoKeys(zoomTransform.scaleWidth, start, 122, end, 100);
        mode = "native-approximation";
      } else if (transition === "directional-wipe" || transition === "luma-wipe") {
        var wipe = tryAddEffect(layer, "ADBE Linear Wipe", "Director Approximation — " + transition);
        if (wipe !== null) {
          keyEffectValue(wipe, ["ADBE Linear Wipe-0001", "Transition Completion"], start, 100);
          keyEffectValue(wipe, ["ADBE Linear Wipe-0001", "Transition Completion"], end, 0);
        } else {
          var wipeFallback = transitionTransform(layer, "Director Transition Fallback — " + transition);
          setTwoKeys(wipeFallback.opacity, start, 0, end, 100);
        }
        mode = "native-approximation";
      } else if (transition === "whip-pan") {
        var transitionParams = item.pluginParams[transition] || {};
        var whipDirection = valueOr(transitionParams, "direction", "left");
        var whipTransform = transitionTransform(layer, "Director Transition — Whip Pan");
        var whipPosition = whipTransform.position.value;
        var sourceScale = 100 / Math.max(0.001, base.scale);
        var offsetX = whipDirection === "left" ? comp.width * sourceScale : whipDirection === "right" ? -comp.width * sourceScale : 0;
        var offsetY = whipDirection === "up" ? comp.height * sourceScale : whipDirection === "down" ? -comp.height * sourceScale : 0;
        setTwoKeys(whipTransform.position, start, [whipPosition[0] + offsetX, whipPosition[1] + offsetY], end, whipPosition);
        setTwoKeys(whipTransform.opacity, start, 0, end, 100);
        var directionalBlur = tryAddEffect(layer, "ADBE Motion Blur", "Director Whip Blur");
        if (directionalBlur !== null) {
          keyEffectValue(directionalBlur, ["ADBE Motion Blur-0002", "Blur Length"], start, comp.width * valueOr(transitionParams, "blur", 0.16));
          keyEffectValue(directionalBlur, ["ADBE Motion Blur-0002", "Blur Length"], end, 0);
        }
        mode = "native-approximation";
      } else if (transition === "glitch-cut") {
        var glitchTransform = transitionTransform(layer, "Director Transition — Glitch Cut");
        glitchTransform.opacity.setValueAtTime(start, 0);
        glitchTransform.opacity.setValueAtTime(start + duration * 0.45, 100);
        glitchTransform.opacity.setValueAtTime(start + duration * 0.6, 20);
        glitchTransform.opacity.setValueAtTime(end, 100);
        easeProperty(glitchTransform.opacity);
        mode = "native-approximation";
      } else if (transition === "ripple-dissolve" || transition === "liquid-melt") {
        var liquidTransform = transitionTransform(layer, "Director Transition — " + transition);
        setTwoKeys(liquidTransform.opacity, start, 0, end, 100);
        var displacement = tryAddEffect(layer, "ADBE Turbulent Displace", "Director Approximation — " + transition);
        if (displacement !== null) {
          keyEffectValue(displacement, ["ADBE Turbulent Displace-0002", "Amount"], start, 42);
          keyEffectValue(displacement, ["ADBE Turbulent Displace-0002", "Amount"], end, 0);
        }
        mode = "native-approximation";
      } else {
        var fallbackTransform = transitionTransform(layer, "Director Transition Fallback — " + transition);
        setTwoKeys(fallbackTransform.opacity, start, 0, end, 100);
        mode = "unsupported-fallback";
        result.warnings.push("Transition " + transition + " used a crossfade fallback.");
      }
      if (mode === "native-approximation" || mode === "unsupported-fallback") {
        result.approximations.push({ type: "transition", id: transition, clipId: item.clipId });
      }
      result.transitions.push({ clipId: item.clipId, id: transition, mode: mode, precisionBits: 32 });
    }

    function parseColor(value) {
      var text = String(value);
      if (text.charAt(0) === "#") text = text.substring(1);
      if (text.length === 3) text = text.charAt(0) + text.charAt(0) + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2);
      return [
        parseInt(text.substring(0, 2), 16) / 255,
        parseInt(text.substring(2, 4), 16) / 255,
        parseInt(text.substring(4, 6), 16) / 255
      ];
    }

    function normalizedFontName(value) {
      return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
    }

    function applyFont(textProperty, candidates) {
      var original = textProperty.value.font;
      var supportsFontObjects = app.fonts && app.fonts.getFontsByPostScriptName;
      var lastFontError = null;
      for (var fontIndex = 0; fontIndex < candidates.length; fontIndex++) {
        try {
          var candidateDocument = textProperty.value;
          var candidateName = candidates[fontIndex];
          if (supportsFontObjects) {
            var fontObjects = app.fonts.getFontsByPostScriptName(candidateName);
            var availableFont = null;
            for (var candidateIndex = 0; candidateIndex < fontObjects.length; candidateIndex++) {
              if (!fontObjects[candidateIndex].isSubstitute) {
                availableFont = fontObjects[candidateIndex];
                break;
              }
            }
            if (availableFont === null) continue;
            candidateDocument.fontObject = availableFont;
          } else {
            candidateDocument.font = candidateName;
          }
          textProperty.setValue(candidateDocument);
          var actual = textProperty.value.font;
          if (normalizedFontName(actual) === normalizedFontName(candidateName)) {
            return { applied: actual, selected: candidateName, substituted: fontIndex > 0, error: null };
          }
        } catch (fontError) {
          lastFontError = fontError.toString();
        }
      }
      return {
        applied: textProperty.value.font || original,
        selected: null,
        substituted: true,
        error: lastFontError
      };
    }

    function anchorFactors(anchor) {
      var horizontal = anchor.indexOf("left") >= 0 ? 0 : anchor.indexOf("right") >= 0 ? 1 : 0.5;
      var vertical = anchor.indexOf("top") >= 0 ? 0 : anchor.indexOf("bottom") >= 0 ? 1 : 0.5;
      return [horizontal, vertical];
    }

    function addDirectorTextLayer(item, spec) {
      var content = spec.style.case === "upper" ? String(spec.content).toUpperCase() : String(spec.content);
      var textLayer = comp.layers.addBoxText([comp.width * spec.widthFraction, comp.height], content);
      textLayer.name = "Director Text — " + spec.id;
      var absoluteIn = clamp(item.startSeconds + spec.timing.inSec, item.startSeconds, item.startSeconds + item.durationSeconds);
      var absoluteOut = clamp(item.startSeconds + spec.timing.outSec, absoluteIn, item.startSeconds + item.durationSeconds);
      textLayer.inPoint = absoluteIn;
      textLayer.outPoint = Math.min(comp.duration, absoluteOut);
      var textProperty = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
      var documentValue = textProperty.value;
      documentValue.text = content;
      documentValue.fontSize = spec.style.sizePx * comp.width / 1080;
      documentValue.applyFill = true;
      documentValue.fillColor = parseColor(spec.style.color);
      documentValue.tracking = Math.round(spec.style.letterSpacing / Math.max(1, spec.style.sizePx) * 1000);
      documentValue.autoLeading = false;
      documentValue.leading = documentValue.fontSize * spec.style.lineHeight;
      try { documentValue.fauxBold = spec.style.weight === "bold"; } catch (boldError) {}
      try { documentValue.fauxItalic = spec.style.italic; } catch (italicError) {}
      if (spec.style.align === "left") documentValue.justification = ParagraphJustification.LEFT_JUSTIFY;
      else if (spec.style.align === "right") documentValue.justification = ParagraphJustification.RIGHT_JUSTIFY;
      else documentValue.justification = ParagraphJustification.CENTER_JUSTIFY;
      if (spec.style.outline.width > 0) {
        documentValue.applyStroke = true;
        documentValue.strokeColor = parseColor(spec.style.outline.color);
        documentValue.strokeWidth = spec.style.outline.width * comp.width / 1080;
        documentValue.strokeOverFill = true;
      }
      textProperty.setValue(documentValue);
      var fontResult = applyFont(textProperty, spec.adobeFontCandidates);

      var transform = textLayer.property("ADBE Transform Group");
      var textBounds = null;
      var factors = anchorFactors(spec.anchor);
      try {
        textBounds = textLayer.sourceRectAtTime(absoluteIn, false);
        transform.property("ADBE Anchor Point").setValue([
          textBounds.left + textBounds.width * factors[0],
          textBounds.top + textBounds.height * factors[1]
        ]);
      } catch (anchorError) {
        result.warnings.push("Text " + spec.id + " could not apply its anchor precisely.");
      }
      transform.property("ADBE Position").setValue([spec.x * comp.width, spec.y * comp.height]);
      transform.property("ADBE Rotate Z").setValue(spec.rotation);
      var fadeInEnd = Math.min(textLayer.outPoint, absoluteIn + spec.timing.fadeInSec);
      var fadeOutStart = Math.max(absoluteIn, textLayer.outPoint - spec.timing.fadeOutSec);
      function applyTextFades(opacityProperty) {
        if (spec.timing.fadeInSec > 0) setTwoKeys(opacityProperty, absoluteIn, 0, fadeInEnd, 100);
        if (spec.timing.fadeOutSec > 0) {
          opacityProperty.setValueAtTime(fadeOutStart, 100);
          opacityProperty.setValueAtTime(textLayer.outPoint, 0);
          easeProperty(opacityProperty);
        }
      }
      applyTextFades(transform.property("ADBE Opacity"));

      if (spec.style.shadow.blur > 0 || spec.style.shadow.offsetX !== 0 || spec.style.shadow.offsetY !== 0) {
        var shadow = tryAddEffect(textLayer, "ADBE Drop Shadow", "Director Text Shadow");
        if (shadow !== null) {
          setEffectValue(shadow, ["ADBE Drop Shadow-0001", "Shadow Color", "Color"], parseColor(spec.style.shadow.color));
          setEffectValue(shadow, ["ADBE Drop Shadow-0005", "Softness"], spec.style.shadow.blur * comp.width / 1080);
          setEffectValue(shadow, ["ADBE Drop Shadow-0004", "Distance"], Math.sqrt(spec.style.shadow.offsetX * spec.style.shadow.offsetX + spec.style.shadow.offsetY * spec.style.shadow.offsetY) * comp.width / 1080);
          setEffectValue(shadow, ["ADBE Drop Shadow-0003", "Direction"], Math.atan2(spec.style.shadow.offsetY, spec.style.shadow.offsetX) * 180 / Math.PI);
        }
      }
      var scrimMode = "none";
      var scrimLayerId = null;
      var scrimGroup = null;
      if (spec.style.background.kind === "scrim") {
        if (textBounds === null) throw new Error("Director could not measure text " + spec.id + " for its scrim.");
        var scrim = comp.layers.addShape();
        scrim.name = "Director Text Scrim — " + spec.id;
        scrim.inPoint = textLayer.inPoint;
        scrim.outPoint = textLayer.outPoint;
        var rootVectors = scrim.property("ADBE Root Vectors Group");
        scrimGroup = rootVectors.addProperty("ADBE Vector Group");
        scrimGroup.name = "Director Scrim";
        var scrimVectors = scrimGroup.property("ADBE Vectors Group");
        var rectangle = scrimVectors.addProperty("ADBE Vector Shape - Rect");
        var paddingX = 22 * comp.width / 1080;
        var paddingY = 14 * comp.width / 1080;
        rectangle.property("ADBE Vector Rect Size").setValue([
          textBounds.width + paddingX * 2,
          textBounds.height + paddingY * 2
        ]);
        rectangle.property("ADBE Vector Rect Position").setValue([
          textBounds.left + textBounds.width * 0.5 - (textBounds.left + textBounds.width * factors[0]),
          textBounds.top + textBounds.height * 0.5 - (textBounds.top + textBounds.height * factors[1])
        ]);
        rectangle.property("ADBE Vector Rect Roundness").setValue(Math.min(paddingX, paddingY) * 0.7);
        var scrimFill = scrimVectors.addProperty("ADBE Vector Graphic - Fill");
        scrimFill.property("ADBE Vector Fill Color").setValue(parseColor(spec.style.background.color));
        scrimFill.property("ADBE Vector Fill Opacity").setValue(spec.style.background.opacity * 100);
        var scrimTransform = scrim.property("ADBE Transform Group");
        scrimTransform.property("ADBE Anchor Point").setValue([0, 0]);
        scrimTransform.property("ADBE Position").setValue([spec.x * comp.width, spec.y * comp.height]);
        scrimTransform.property("ADBE Rotate Z").setValue(spec.rotation);
        applyTextFades(scrimTransform.property("ADBE Opacity"));
        scrim.moveAfter(textLayer);
        scrimMode = "native-shape";
        scrimLayerId = String(scrim.id);
      }

      // Some AE font environments reapply the Character panel face while a
      // box-text layer is measured or receives effects. Reassert the verified
      // real FontObject last, then refresh geometry from the final glyphs.
      fontResult = applyFont(textProperty, spec.adobeFontCandidates);
      if (fontResult.substituted) result.warnings.push("Text " + spec.id + " used an After Effects fallback font.");
      try {
        var finalBounds = textLayer.sourceRectAtTime(absoluteIn, false);
        transform.property("ADBE Anchor Point").setValue([
          finalBounds.left + finalBounds.width * factors[0],
          finalBounds.top + finalBounds.height * factors[1]
        ]);
        if (scrimGroup !== null) {
          var finalScrimRectangle = scrimGroup
            .property("ADBE Vectors Group")
            .property("ADBE Vector Shape - Rect");
          finalScrimRectangle.property("ADBE Vector Rect Size").setValue([
            finalBounds.width + paddingX * 2,
            finalBounds.height + paddingY * 2
          ]);
          finalScrimRectangle.property("ADBE Vector Rect Position").setValue([
            finalBounds.left + finalBounds.width * 0.5 - (finalBounds.left + finalBounds.width * factors[0]),
            finalBounds.top + finalBounds.height * 0.5 - (finalBounds.top + finalBounds.height * factors[1])
          ]);
        }
      } catch (finalTextLayoutError) {
        throw new Error("Director could not finalize text layout for " + spec.id + ": " + finalTextLayoutError.toString());
      }
      var finalTextDocument = textProperty.value;
      result.textLayers.push({
        clipId: item.clipId,
        id: spec.id,
        layerId: String(textLayer.id),
        font: finalTextDocument.font,
        fontStyle: finalTextDocument.fontStyle,
        selectedFontCandidate: fontResult.selected,
        fontError: fontResult.error,
        requestedWeight: spec.style.weight,
        requestedItalic: spec.style.italic,
        fauxBold: finalTextDocument.fauxBold,
        fauxItalic: finalTextDocument.fauxItalic,
        scrim: scrimMode,
        scrimLayerId: scrimLayerId,
        precisionBits: 32
      });
    }

    var pixelSortEffects = [];
    var clipLayers = [];
    var clipData = ${es3(clips)};
    for (var clipIndex = 0; clipIndex < clipData.length; clipIndex++) {
      var item = clipData[clipIndex];
      var footage = importFootage(item.path);
      var layer = comp.layers.add(footage);
      layer.name = "Director Clip " + (clipIndex + 1) + " — " + item.title;
      layer.startTime = item.startSeconds - item.sourceTimeSeconds;
      layer.inPoint = item.startSeconds;
      layer.outPoint = Math.min(comp.duration, item.startSeconds + item.durationSeconds);
      layer.motionBlur = true;
      var base = centerAndFit(layer);
      clipLayers.push(layer);
      result.media.push({
        id: item.mediaId,
        path: item.path,
        layerId: String(layer.id),
        start: item.startSeconds,
        sourceTime: item.sourceTimeSeconds,
        duration: item.durationSeconds,
        preparedVisualEffects: item.preparedVisualEffectStack || [],
        preparedMotion: item.preparedMotion === true
      });
      if (item.preparedMotion === true) {
        result.motions.push({
          clipId: item.clipId,
          id: item.motion,
          mode: "director-exact-plate",
          plateBitDepth: 8,
          precisionBits: 32
        });
      } else {
        applyMotion(layer, item, base);
      }
      for (var gradeIndex = 0; gradeIndex < item.gradeStack.length; gradeIndex++) {
        applyGrade(layer, item, item.gradeStack[gradeIndex]);
      }
      var preparedVisualEffects = item.preparedVisualEffectStack || [];
      for (var visualIndex = 0; visualIndex < item.visualEffectStack.length; visualIndex++) {
        var visualEffectId = item.visualEffectStack[visualIndex];
        if (arrayContains(preparedVisualEffects, visualEffectId)) {
          result.effects.push({
            clipId: item.clipId,
            id: visualEffectId,
            contract: visualEffectId === "pixel-sort" ? ${JSON.stringify(pixelSortContract.id)} : null,
            mode: "director-exact-plate",
            installed: true,
            nativeInstalled: visualEffectId === "pixel-sort" ? false : null,
            plateBitDepth: 8,
            precisionBits: 32
          });
        } else {
          applyVisualEffect(layer, item, visualEffectId, pixelSortEffects);
        }
      }
      applyTransition(layer, clipIndex > 0 ? clipLayers[clipIndex - 1] : null, item, base);
    }

    for (var textClipIndex = 0; textClipIndex < clipData.length; textClipIndex++) {
      var textItem = clipData[textClipIndex];
      for (var textIndex = 0; textIndex < textItem.textLayers.length; textIndex++) {
        addDirectorTextLayer(textItem, textItem.textLayers[textIndex]);
      }
    }

    ${audioPath ? `
    var audioFootage = importFootage(${JSON.stringify(audioPath)});
    var audioLayer = comp.layers.add(audioFootage);
    audioLayer.name = ${JSON.stringify(`Director Audio — ${plan.title}`)};
    audioLayer.startTime = 0;
    audioLayer.inPoint = 0;
    audioLayer.outPoint = Math.min(comp.duration, audioFootage.duration);
    result.media.push({ id: ${JSON.stringify(audio?.id)}, path: ${JSON.stringify(audioPath)}, layerId: String(audioLayer.id), start: 0, duration: comp.duration });
    ${beatsEnabled ? `
    var layerIdsBeforeAudioConversion = {};
    for (var beforeIndex = 1; beforeIndex <= comp.numLayers; beforeIndex++) {
      layerIdsBeforeAudioConversion[String(comp.layer(beforeIndex).id)] = true;
    }
    for (var selectIndex = 1; selectIndex <= comp.numLayers; selectIndex++) comp.layer(selectIndex).selected = false;
    comp.openInViewer();
    audioLayer.selected = true;
    var audioCommand = app.findMenuCommandId("Convert Audio to Keyframes");
    if (audioCommand <= 0) throw new Error("After Effects could not find Convert Audio to Keyframes; Director Beat Sync cannot continue.");
    app.executeCommand(audioCommand);
    audioLayer.selected = false;
    var amplitude = null;
    for (var amplitudeIndex = 1; amplitudeIndex <= comp.numLayers; amplitudeIndex++) {
      var candidateLayer = comp.layer(amplitudeIndex);
      if (!layerIdsBeforeAudioConversion[String(candidateLayer.id)]) {
        amplitude = candidateLayer;
        break;
      }
    }
    if (amplitude === null) throw new Error("After Effects did not create the Audio Amplitude layer required by Director Beat Sync.");
    var bothChannels = null;
    var amplitudeEffects = amplitude.property("ADBE Effect Parade");
    for (var amplitudeEffectIndex = 1; amplitudeEffectIndex <= amplitudeEffects.numProperties; amplitudeEffectIndex++) {
      var sliderCandidate = findEffectProperty(
        amplitudeEffects.property(amplitudeEffectIndex),
        ["ADBE Slider Control-0001", "Slider"]
      );
      if (sliderCandidate !== null) bothChannels = sliderCandidate;
    }
    if (bothChannels === null) throw new Error("Director Beat Sync could not read the Both Channels amplitude slider.");
    var beatMap = addBeatMapLayer(${JSON.stringify(plan.timeline.beats.markerLayerName)});
    var markerProperty = beatMap.property("ADBE Marker");
    var beatSliderEffect = tryAddEffect(beatMap, "ADBE Slider Control", "Beat Pulse");
    if (beatSliderEffect === null) throw new Error("Director Beat Sync could not create its Beat Pulse control.");
    var beatSlider = findEffectProperty(beatSliderEffect, ["ADBE Slider Control-0001", "Slider"]);
    if (beatSlider === null) throw new Error("Director Beat Sync could not access its Beat Pulse slider.");
    var sampleStep = 1 / ${plan.composition.frameRate};
    var amplitudes = [];
    var maxAmplitude = 0;
    for (var sampleTime = 0; sampleTime < comp.duration; sampleTime += sampleStep) {
      var sampleValue = bothChannels.valueAtTime(sampleTime, false);
      amplitudes.push(sampleValue);
      if (sampleValue > maxAmplitude) maxAmplitude = sampleValue;
    }
    var positiveAmplitudes = [];
    for (var amplitudeValueIndex = 0; amplitudeValueIndex < amplitudes.length; amplitudeValueIndex++) {
      if (amplitudes[amplitudeValueIndex] > 0.001) positiveAmplitudes.push(amplitudes[amplitudeValueIndex]);
    }
    positiveAmplitudes.sort(function (left, right) { return left - right; });
    var amplitudeMedian = positiveAmplitudes.length > 0
      ? positiveAmplitudes[Math.floor((positiveAmplitudes.length - 1) * 0.5)]
      : 0;
    var amplitudeUpper = positiveAmplitudes.length > 0
      ? positiveAmplitudes[Math.floor((positiveAmplitudes.length - 1) * 0.9)]
      : 0;
    var adaptiveThreshold = Math.max(0.5, amplitudeMedian + (amplitudeUpper - amplitudeMedian) * 0.45);
    var configuredThreshold = ${plan.timeline.beats.threshold};
    var effectiveBeatThreshold = maxAmplitude > 0 && maxAmplitude < configuredThreshold
      ? adaptiveThreshold
      : Math.max(configuredThreshold, adaptiveThreshold);
    var lastBeatTime = -${plan.timeline.beats.minimumGapSeconds};
    var beatTimes = [];
    var beatStrengths = [];
    for (var sampleIndex = 1; sampleIndex < amplitudes.length - 1; sampleIndex++) {
      var value = amplitudes[sampleIndex];
      var previous = amplitudes[sampleIndex - 1];
      var next = amplitudes[sampleIndex + 1];
      var time = sampleIndex * sampleStep;
      if (value >= effectiveBeatThreshold &&
          value >= previous * ${plan.timeline.beats.riseRatio} &&
          value >= next &&
          time - lastBeatTime >= ${plan.timeline.beats.minimumGapSeconds}) {
        var strength = maxAmplitude > effectiveBeatThreshold
          ? clamp((value - effectiveBeatThreshold) / (maxAmplitude - effectiveBeatThreshold), 0, 1)
          : 1;
        var pulse = 45 + strength * 55;
        markerProperty.setValueAtTime(time, new MarkerValue("Director beat " + Math.round(pulse)));
        beatSlider.setValueAtTime(Math.max(0, time - sampleStep), 0);
        beatSlider.setValueAtTime(time, pulse);
        beatSlider.setValueAtTime(Math.min(comp.duration, time + ${plan.timeline.beats.pulseDurationSeconds}), 0);
        beatTimes.push(time);
        beatStrengths.push(pulse);
        lastBeatTime = time;
      }
    }
    var appliedBeatEffects = 0;
    for (var beatEffectIndex = 0; beatEffectIndex < pixelSortEffects.length; beatEffectIndex++) {
      var beatEffectEntry = pixelSortEffects[beatEffectIndex];
      var currentBeatEffect = null;
      try {
        currentBeatEffect = effectParade(beatEffectEntry.layer).property(beatEffectEntry.effectName);
      } catch (beatEffectLookupError) {}
      var beatAmount = findEffectProperty(currentBeatEffect, beatEffectEntry.beatPropertyNames);
      if (beatAmount === null) {
        result.warnings.push(
          ${JSON.stringify(`${pixelSortContract.displayName} could not attach ${pixelSortContract.beatAmountParameter} to clip `)} +
          beatEffectEntry.clipId + "."
        );
        continue;
      }
      beatAmount.setValueAtTime(0, 0);
      for (var beatIndex = 0; beatIndex < beatTimes.length; beatIndex++) {
        var beatTime = beatTimes[beatIndex];
        beatAmount.setValueAtTime(Math.max(0, beatTime - sampleStep), 0);
        beatAmount.setValueAtTime(beatTime, beatStrengths[beatIndex]);
        beatAmount.setValueAtTime(Math.min(comp.duration, beatTime + ${plan.timeline.beats.pulseDurationSeconds}), 0);
      }
      appliedBeatEffects++;
    }
    result.beatSync = {
      contract: ${JSON.stringify(beatSyncContract.id)},
      displayName: ${JSON.stringify(beatSyncContract.displayName)},
      source: ${JSON.stringify(plan.timeline.beats.source)},
      layerId: String(beatMap.id),
      amplitudeLayerId: String(amplitude.id),
      beatCount: beatTimes.length,
      appliedEffectCount: appliedBeatEffects,
      configuredThreshold: configuredThreshold,
      effectiveThreshold: effectiveBeatThreshold,
      threshold: effectiveBeatThreshold,
      amplitudeMedian: amplitudeMedian,
      amplitudeUpper: amplitudeUpper,
      riseRatio: ${plan.timeline.beats.riseRatio},
      minimumGapSeconds: ${plan.timeline.beats.minimumGapSeconds}
    };
    ` : `
    result.beatSync = {
      contract: ${JSON.stringify(beatSyncContract.id)},
      displayName: ${JSON.stringify(beatSyncContract.displayName)},
      source: ${JSON.stringify(plan.timeline.beats.source)},
      enabled: false,
      reason: "Beat analysis was disabled."
    };
    `}
    ` : `
    result.beatSync = {
      contract: ${JSON.stringify(beatSyncContract.id)},
      displayName: ${JSON.stringify(beatSyncContract.displayName)},
      source: ${JSON.stringify(plan.timeline.beats.source)},
      enabled: false,
      reason: "No audio was supplied."
    };
    `}

    // External aerender does not update the GUI queue state. Remove only old
    // Director-owned intermediate items before adding the next one so repeated
    // one-click renders do not accumulate stale queue entries.
    var directorQueueSuffix = "-director-adobe.mov";
    for (var staleQueueIndex = project.renderQueue.numItems; staleQueueIndex >= 1; staleQueueIndex--) {
      try {
        var staleQueueItem = project.renderQueue.item(staleQueueIndex);
        var staleQueueFile = staleQueueItem.outputModule(1).file;
        var staleQueuePath = staleQueueFile ? staleQueueFile.fsName : "";
        if (
          staleQueuePath.length >= directorQueueSuffix.length &&
          staleQueuePath.substring(staleQueuePath.length - directorQueueSuffix.length) === directorQueueSuffix
        ) {
          staleQueueItem.remove();
          result.removedStaleQueueItems++;
        }
      } catch (staleQueueError) {
        result.warnings.push("Could not remove one stale Director render queue item.");
      }
    }

    renderItem = project.renderQueue.items.add(comp);
    renderItem.timeSpanStart = 0;
    renderItem.timeSpanDuration = comp.duration;
    var outputModule = renderItem.outputModule(1);
    var outputProfiles = ${es3(outputProfiles)};
    var templates = outputModule.templates;
    var appliedTemplate = null;
    var appliedProfile = null;
    var triedTemplates = [];
    for (var profileIndex = 0; profileIndex < outputProfiles.length && appliedTemplate === null; profileIndex++) {
      var profile = outputProfiles[profileIndex];
      for (var candidateIndex = 0; candidateIndex < profile.candidates.length && appliedTemplate === null; candidateIndex++) {
        triedTemplates.push(profile.candidates[candidateIndex]);
        for (var templateIndex = 0; templateIndex < templates.length; templateIndex++) {
          if (String(templates[templateIndex]).toLowerCase() === String(profile.candidates[candidateIndex]).toLowerCase()) {
            outputModule.applyTemplate(templates[templateIndex]);
            appliedTemplate = templates[templateIndex];
            appliedProfile = profile;
            break;
          }
        }
      }
    }
    if (appliedTemplate === null) {
      throw new Error(
        "Director requires a known HLG ProRes output-module template. Tried: " +
        triedTemplates.join(", ") + ". Available templates: " + templates.join(", ")
      );
    }
    outputModule.file = new File(${JSON.stringify(outputPath)});
    // RenderQueueItem has no public index property; a newly added item is
    // always the final item in the queue.
    result.renderQueueIndex = project.renderQueue.numItems;
    result.outputModuleTemplate = appliedTemplate;
    result.outputModuleTier = appliedProfile.tier;
    result.outputCodec = appliedProfile.codec;
    result.outputBitDepth = appliedProfile.bitDepth;
    result.outputColorSpace = appliedProfile.colorSpace;
    result.outputPostProcess = appliedProfile.postProcess;
    if (appliedProfile.tier !== "preferred") {
      result.warnings.push(
        "Preferred ProRes 4444 template was unavailable; used verified " +
        appliedProfile.codec + " " + appliedProfile.bitDepth + "-bit intermediate."
      );
    }
    result.outputPath = outputModule.file.fsName;
    if (project.file) {
      project.save();
      result.projectPath = project.file.fsName;
      result.projectSaveMode = "saved-existing";
    } else if (${projectSavePath === undefined ? 'false' : 'true'}) {
      project.save(new File(${JSON.stringify(projectSavePath ?? '')}));
      result.projectPath = project.file.fsName;
      result.projectSaveMode = "saved-automatic";
    } else {
      result.warnings.push("The After Effects project is untitled, so aerender cannot start automatically.");
    }
    result.status = "queued";
    return result;
  } catch (buildError) {
    // ExtendScript undo groups do not roll themselves back. Remove only items
    // created by this transaction, and restore project colour settings.
    if (renderItem !== null) {
      try { renderItem.remove(); } catch (renderCleanupError) {}
    }
    if (comp !== null) {
      try { comp.remove(); } catch (compCleanupError) {}
    }
    // This also catches solids created implicitly by addNull() and by
    // Convert Audio to Keyframes.
    if (project) {
      for (var cleanupIndex = project.numItems; cleanupIndex >= 1; cleanupIndex--) {
        try {
          var cleanupItem = project.item(cleanupIndex);
          if (!projectItemIdsBefore[String(cleanupItem.id)]) cleanupItem.remove();
        } catch (itemCleanupError) {}
      }
    }
    if (project) {
      try { if (originalBitsPerChannel !== null) project.bitsPerChannel = originalBitsPerChannel; } catch (bitsCleanupError) {}
      try { if (originalWorkingSpace !== null) project.workingSpace = originalWorkingSpace; } catch (spaceCleanupError) {}
    }
    throw buildError;
  } finally {
    app.endUndoGroup();
  }
}());
`;
}
