import type {
  DirectorReelAction,
  DirectionContract,
  DirectorContext,
  DirectorResponse,
  DirectorVisualEffectVocabulary,
  ReelAspectRatio,
  ReelEffect,
  ReelMotion,
  ReelQuality,
  ReelTransition,
  StorySequence,
} from '../shared/directorSchemas';

function reelAction(type: DirectorReelAction['type'], values: Partial<DirectorReelAction> = {}): DirectorReelAction {
  return {
    type,
    objectIds: [],
    clipIds: [],
    aspectRatio: null,
    fps: null,
    quality: null,
    effect: null,
    visualEffect: null,
    transition: null,
    motion: null,
    duration: null,
    intensity: null,
    caption: null,
    ...values,
  };
}

function buildContract(context: DirectorContext): DirectionContract {
  const selected = context.canvas.filter((object) => object.selected);
  const candidates = selected.length ? selected : context.canvas;
  return {
    title: 'The Quiet Monument',
    objective: context.goal || 'Create a controlled cinematic campaign that becomes a six-beat visual story.',
    inheritance: candidates.slice(0, 6).map((object) => ({
      objectId: object.id,
      sourceTitle: object.title,
      channels: object.inherit.length ? object.inherit : ['emotion'],
      rationale: `Use only the chosen ${object.inherit.join(', ') || 'emotional'} qualities from this source.`,
    })),
    locks: ['product silhouette', 'guardian identity', 'graphite palette', 'brushed-metal world'],
    exclusions: context.exclusions.length ? context.exclusions : ['neon', 'fantasy ornament', 'warm sunset'],
    conflicts: [{
      issue: 'The intimate emotional reference conflicts with the cold architectural material language.',
      resolution: 'Keep the architecture cold, but soften the subject light and expression rather than warming the full palette.',
    }],
    coherence: 92,
  };
}

function buildSequence(): StorySequence {
  const beats = [
    ['Arrival', 'Isolation', 'The guardian enters the rain-lit monument with the vessel concealed.', 'Wide low angle', 'Slow forward drift'],
    ['The Call', 'Recognition', 'A reflected signal appears across the brushed-metal surface.', 'Medium profile', 'Controlled lateral track'],
    ['Resistance', 'Defiance', 'The guardian turns away while the world closes around the frame.', 'Compressed close-up', 'Subtle push-in'],
    ['Vulnerability', 'Quiet fracture', 'The vessel is revealed as the guardian lowers their defence.', 'Intimate eye level', 'Breath-paced handheld float'],
    ['Compassion', 'Connection', 'A second hand enters; the product becomes the bridge between figures.', 'Tight two-shot', 'Gentle orbit'],
    ['New Path', 'Resolve', 'The guardian walks toward the vertical light with identity and world intact.', 'Monumental wide', 'Pull-back into loop'],
  ];
  return {
    title: 'The Quiet Monument — Sequence 01',
    northStar: 'Contained strength becomes chosen connection.',
    arc: 'Isolation → recognition → resistance → vulnerability → compassion → renewed resolve.',
    beats: beats.map(([title, emotion, visualAction, camera, motion], index) => ({
      id: `beat-${index + 1}`,
      order: index + 1,
      title,
      emotion,
      visualAction,
      camera,
      motion,
      continuityLocks: ['identity', 'silhouette', 'palette', 'world'],
    })),
  };
}

function currentClipIds(context: DirectorContext) {
  return [...new Set(context.reelProject?.clips.map((clip) => clip.id) || [])];
}

function selectedClipIds(context: DirectorContext) {
  const current = new Set(currentClipIds(context));
  return [...new Set(context.reelProject?.selectedClipIds || [])].filter((id) => current.has(id));
}

function targetsForRequest(lower: string, context: DirectorContext) {
  const all = currentClipIds(context);
  const selected = selectedClipIds(context);
  const scopeText = lower.replace(/[“"][^”"]*[”"]/g, '').replace(/'[^']*'/g, '');
  const explicitlyAll = /\b(all|every|entire|whole)\b/.test(scopeText);
  const explicitlySelected = /\b(selected|selection|active|current clip)\b/.test(scopeText);
  if (explicitlyAll && !explicitlySelected) return { ids: all, label: 'the entire reel', explicitSelection: false };
  if (explicitlySelected) return { ids: selected, label: 'the selected clips', explicitSelection: true };
  if (explicitlyAll) return { ids: all, label: 'the entire reel', explicitSelection: false };
  if (selected.length) return { ids: selected, label: selected.length === 1 ? 'the selected clip' : 'the selected clips', explicitSelection: false };
  return { ids: all, label: 'all current clips', explicitSelection: false };
}

function detectEffect(lower: string): ReelEffect | null {
  if (/\b(?:remove|clear|reset)\b.*\b(?:grade|look|color)\b/.test(lower)) return 'clean';
  if (/\b(?:black\s*(?:and|&)\s*white|monochrome|mono)\b/.test(lower)) return 'mono';
  if (/\bhdr(?: look)?\b/.test(lower)) return 'hdr';
  if (/\bcinematic\b/.test(lower)) return 'cinematic';
  if (/\bwarm\b/.test(lower)) return 'warm';
  if (/\bcool\b/.test(lower)) return 'cool';
  if (/\bteal\s*(?:\+|and|&)\s*orange\b/.test(lower)) return 'teal-orange';
  if (/\bvintage(?: film)?\b/.test(lower)) return 'vintage-film';
  if (/\bbleach(?: |-)?bypass\b/.test(lower)) return 'bleach-bypass';
  if (/\bpunch(?:y)?(?: detail)?\b/.test(lower)) return 'punch';
  if (/\bclean\b/.test(lower)) return 'clean';
  return null;
}

function detectVisualEffect(lower: string): DirectorVisualEffectVocabulary | null {
  if (/\b(?:remove|clear|reset|no)\b.*\b(?:visual )?effect\b/.test(lower)) return 'none';
  if (/\bpixel(?: |-)?sort(?:ing)?\b/.test(lower)) return 'pixel-sort';
  if (/\bglitch(?: |-)?burst\b/.test(lower)) return 'glitch-burst';
  if (/\bcrt(?: |-)?scan\b/.test(lower)) return 'crt-scan';
  if (/\bhalftone(?: |-)?reveal\b|\bhalftone\b/.test(lower)) return 'halftone-reveal';
  if (/\bripple(?: |-)?drift\b|\bliquid ripple\b/.test(lower)) return 'ripple-drift';
  if (/\bmotion(?: |-)?echo\b|\blight trails?\b/.test(lower)) return 'motion-echo';
  if (/\bthreshold(?: |-)?melt\b|\btwo(?: |-)?tone melt\b/.test(lower)) return 'threshold-melt';
  if (/\b(?:rgb|colour|color)(?: |-)?split\b|\bchromatic aberration\b/.test(lower)) return 'rgb-split';
  if (/\b(?:film )?grain\b/.test(lower)) return 'film-grain';
  if (/\bscanlines?\b/.test(lower)) return 'scanlines';
  if (/\bglow\b/.test(lower)) return 'glow';
  if (/\bdream(?:y| haze)?\b/.test(lower)) return 'dream';
  if (/\bvignette\b/.test(lower)) return 'vignette';
  if (/\bblur(?:red)?\b/.test(lower)) return 'blur';
  if (/\b(?:seamless )?loop(?: pulse)?\b/.test(lower)) return 'loop';
  if (/\bhalation\b/.test(lower)) return 'halation';
  if (/\banamorphic(?: |-)?bloom\b/.test(lower)) return 'anamorphic-bloom';
  return null;
}

function detectTransition(lower: string): ReelTransition | null {
  if (/\b(?:dip|fade)\s+(?:to\s+)?black\b/.test(lower)) return 'dip-black';
  if (/\bslide(?:\s+to)?\s+right\b/.test(lower)) return 'slide-right';
  if (/\bslide(?:\s+to)?\s+left\b/.test(lower)) return 'slide-left';
  if (/\b(?:iris(?: reveal)?|circle reveal|zoom transition)\b/.test(lower)) return 'zoom';
  if (/\b(?:soft(?: |-)?dissolve|dissolve)\b/.test(lower)) return 'soft-dissolve';
  if (/\b(?:cross(?: |-)?fade|crossfade)\b/.test(lower)) return 'crossfade';
  if (/\b(?:hard )?cut(?:s)?\b/.test(lower)) return 'cut';
  if (/\bslide\b/.test(lower)) return 'slide-left';
  if (/\btransition(?:s)?\b/.test(lower) && /\b(?:restrained|subtle|gentle|simple)\b/.test(lower)) return 'crossfade';
  return null;
}

function detectMotion(lower: string): ReelMotion | null {
  if (/\b(?:no (?:camera )?motion|keep (?:it )?still|still frame|still)\b/.test(lower)) return 'still';
  if (/\bpull(?: |-)?out\b/.test(lower)) return 'pull-out';
  if (/\bpush(?: |-)?in\b/.test(lower)) return 'push-in';
  if (/\bpan(?: |-)?left\b/.test(lower)) return 'pan-left';
  if (/\bpan(?: |-)?right\b/.test(lower)) return 'pan-right';
  if (/\bpan(?: |-)?up\b/.test(lower)) return 'pan-up';
  if (/\bpan(?: |-)?down\b/.test(lower)) return 'pan-down';
  return null;
}

function detectDuration(lower: string): number | null {
  const match = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/);
  if (!match) return null;
  if (/\btransition(?:s)?\b/.test(lower) && !/\b(?:clip|clips|each|timing)\b/.test(lower)) return null;
  const duration = Number(match[1]);
  return duration >= 1 && duration <= 12 ? duration : null;
}

function detectCaption(message: string, lower: string): string | null | undefined {
  if (!/\b(?:caption|captions|subtitle|subtitles|text overlay)\b/.test(lower)) return undefined;
  if (/\b(?:remove|clear|delete)\b.*\b(?:caption|captions|subtitle|subtitles|text overlay)\b/.test(lower)) return '';
  const quoted = message.match(/[“"]([^”"]+)[”"]/) || message.match(/'([^']+)'/);
  if (quoted) return quoted[1].trim().slice(0, 180);
  const trailing = message.match(/\b(?:caption|subtitle|text overlay)\s*(?:to|as|saying|reading|:|-)\s*(.+)$/i);
  if (!trailing) return null;
  return trailing[1]
    .replace(/\s+(?:to|on)\s+(?:all|every|the entire|selected|the selected)\s+clips?\s*$/i, '')
    .trim()
    .slice(0, 180) || null;
}

function detectProjectSettings(lower: string): {
  aspectRatio: ReelAspectRatio | null;
  fps: 24 | 30 | null;
  quality: ReelQuality | null;
} {
  const quality = /\b(?:high quality|1080p|final quality)\b/.test(lower) ? 'high'
    : /\b(?:balanced quality|720p)\b/.test(lower) ? 'balanced'
      : /\b(?:draft quality|540p)\b/.test(lower) ? 'draft'
        : null;
  const fps = /\b24\s*fps\b/.test(lower) ? 24 : /\b30\s*fps\b/.test(lower) ? 30 : null;
  const aspectRatio = /\b(?:9\s*:\s*16|vertical|portrait)\b/.test(lower) ? '9:16'
    : /\b(?:1\s*:\s*1|square)\b/.test(lower) ? '1:1'
      : /\b(?:16\s*:\s*9|wide|widescreen|landscape)\b/.test(lower) ? '16:9'
        : null;
  return { aspectRatio, fps, quality };
}

function effectLabel(effect: ReelEffect) {
  if (effect === 'hdr') return 'HDR look';
  if (effect === 'mono') return 'monochrome';
  return effect;
}

function reelResponse(message: string, context: DirectorContext): DirectorResponse | null {
  const lower = message.toLowerCase();
  const music = /\b(?:local\s+)?(?:music|audio|soundtrack)\b/.test(lower)
    && /\b(?:add|choose|select|replace|change|use|music|audio|soundtrack)\b/.test(lower);
  if (music) {
    return {
      message: 'Music is selected directly from your device in Reel Studio. I opened the local editor; use Add local music to choose the file. I did not upload or add audio for you.',
      mode: 'animate',
      directionContract: context.directionContract,
      sequence: context.sequence,
      continuity: null,
      canvasActions: [],
      reelActions: [reelAction('open_reel_studio')],
      suggestedActions: ['Use high quality', 'Apply crossfade to all clips', 'Render on this device'],
    };
  }

  const render = /\brender\s+on\s+(?:this|my|the)\s+device\b/.test(lower)
    || /\b(render|export)\b.*\b(reel|video|mp4)\b|\b(reel|video|mp4)\b.*\b(render|export)\b/.test(lower)
    || /\brender\s+(?:this|it|now)\b/.test(lower);
  if (render) {
    const settings = detectProjectSettings(lower);
    const hasSettings = Boolean(settings.aspectRatio || settings.fps || settings.quality);
    return {
      message: 'I opened the local render confirmation. The browser will create the MP4 only after you approve Render on this device; your media stays in this browser.',
      mode: 'export',
      directionContract: context.directionContract,
      sequence: context.sequence,
      continuity: null,
      canvasActions: [],
      reelActions: [
        reelAction('open_reel_studio'),
        ...(hasSettings ? [reelAction('set_project', settings)] : []),
        reelAction('request_render'),
      ],
      suggestedActions: ['Use high quality', 'Add local music', 'Set every clip to 3 seconds'],
    };
  }

  const clipIds = currentClipIds(context);
  const selectedIds = selectedClipIds(context);
  const removeClips = /\b(?:remove|delete)\b/.test(lower)
    && (/\bclips?\b/.test(lower) || /\b(?:selected|all|every|entire)\b/.test(lower))
    && !/\b(?:caption|subtitle|text overlay|effect|grade|look|blur|vignette|motion|transition)\b/.test(lower);
  if (removeClips) {
    const targets = targetsForRequest(lower, context);
    if (!targets.ids.length) {
      return {
        message: targets.explicitSelection ? 'No current reel clip is selected, so I did not remove anything.' : 'There are no current reel clips to remove.',
        mode: 'animate',
        directionContract: context.directionContract,
        sequence: context.sequence,
        continuity: null,
        canvasActions: [],
        reelActions: [reelAction('open_reel_studio')],
        suggestedActions: ['Apply cinematic look to all clips', 'Add local music', 'Render on this device'],
      };
    }
    return {
      message: `Removed ${targets.ids.length} ${targets.ids.length === 1 ? 'clip' : 'clips'} from the local timeline.`,
      mode: 'animate',
      directionContract: context.directionContract,
      sequence: context.sequence,
      continuity: null,
      canvasActions: [],
      reelActions: [reelAction('open_reel_studio'), reelAction('remove_clips', { clipIds: targets.ids })],
      suggestedActions: ['Reverse clip order', 'Apply crossfade to all clips', 'Render on this device'],
    };
  }

  const reverse = /\breverse\b/.test(lower) && /\b(?:order|clips?|timeline|reel)\b/.test(lower);
  const moveSelectedToStart = /\b(?:move|put)\b.*\bselected\b.*\b(?:first|start|front|beginning)\b/.test(lower);
  const moveSelectedToEnd = /\b(?:move|put)\b.*\bselected\b.*\b(?:last|end|back)\b/.test(lower);
  const ordinalMove = lower.match(/\b(?:move|put)\s+(?:clip\s+)?(\d+)\b.*\b(first|start|front|beginning|last|end|back)\b/);
  if (reverse || moveSelectedToStart || moveSelectedToEnd || ordinalMove) {
    let ordered = [...clipIds];
    if (reverse) ordered.reverse();
    if (moveSelectedToStart || moveSelectedToEnd) {
      const chosen = new Set(selectedIds);
      const rest = ordered.filter((id) => !chosen.has(id));
      ordered = moveSelectedToStart ? [...selectedIds, ...rest] : [...rest, ...selectedIds];
    }
    if (ordinalMove) {
      const index = Number(ordinalMove[1]) - 1;
      const chosen = ordered[index];
      if (chosen) {
        const rest = ordered.filter((id) => id !== chosen);
        const atStart = /^(?:first|start|front|beginning)$/.test(ordinalMove[2]);
        ordered = atStart ? [chosen, ...rest] : [...rest, chosen];
      }
    }
    const changed = ordered.length > 1 && ordered.some((id, index) => id !== clipIds[index]);
    return {
      message: changed ? 'Reordered the current clips in the local timeline.' : 'The requested order does not change the current timeline.',
      mode: 'animate',
      directionContract: context.directionContract,
      sequence: context.sequence,
      continuity: null,
      canvasActions: [],
      reelActions: [reelAction('open_reel_studio'), ...(changed ? [reelAction('reorder_clips', { clipIds: ordered })] : [])],
      suggestedActions: ['Apply crossfade to all clips', 'Set every clip to 3 seconds', 'Render on this device'],
    };
  }

  const addClips = /\b(?:add|turn|convert)\b.*\b(?:reference|references|image|images|canvas|selection|selected)\b.*\b(?:reel|clips?|timeline)\b/.test(lower)
    || /\b(?:add|turn|convert)\b.*\b(?:reel|clips?|timeline)\b.*\b(?:reference|references|image|images|canvas|selection|selected)\b/.test(lower);
  if (addClips) {
    const eligible = context.canvas.filter((object) => ['reference', 'upload', 'created'].includes(object.kind));
    const existingObjectIds = new Set(context.reelProject?.clips.flatMap((clip) => clip.objectId ? [clip.objectId] : []) || []);
    const all = /\b(all|every|entire)\b/.test(lower);
    const objectIds = (all ? eligible : eligible.filter((object) => object.selected))
      .map((object) => object.id)
      .filter((id) => !existingObjectIds.has(id));
    return {
      message: objectIds.length
        ? `Sent ${objectIds.length} visual ${objectIds.length === 1 ? 'source' : 'sources'} to Reel Studio for local clip creation.`
        : 'No eligible visual source is selected, so I opened Reel Studio without adding a clip.',
      mode: 'animate',
      directionContract: context.directionContract,
      sequence: context.sequence,
      continuity: null,
      canvasActions: [],
      reelActions: [reelAction('open_reel_studio'), ...(objectIds.length ? [reelAction('add_clips', { objectIds })] : [])],
      suggestedActions: ['Apply cinematic look to all clips', 'Add local music', 'Render on this device'],
    };
  }

  const effect = detectEffect(lower);
  const visualEffect = detectVisualEffect(lower);
  const transition = detectTransition(lower);
  const motion = detectMotion(lower);
  const duration = detectDuration(lower);
  const caption = detectCaption(message, lower);
  const settings = detectProjectSettings(lower);
  const hasSettings = Boolean(settings.aspectRatio || settings.fps || settings.quality);
  const hasStyle = Boolean(effect || visualEffect || transition || motion || duration !== null || caption !== undefined);
  const activeReel = Boolean(context.reelProject?.open);
  const reelLanguage = /\b(?:reel|video edit|reel studio|ffmpeg|timeline|clips?|transition|caption|subtitle|camera motion)\b/.test(lower);
  const referenceSearch = /\b(?:search|find|place|add)\b/.test(lower) && /\breferences?\b/.test(lower) && !/\b(?:reel|clips?|timeline)\b/.test(lower);
  if (referenceSearch || (!hasSettings && !hasStyle && !reelLanguage) || (!reelLanguage && !activeReel && !hasSettings)) return null;

  const targets = targetsForRequest(lower, context);
  if (hasStyle && targets.explicitSelection && context.reelProject && !targets.ids.length) {
    return {
      message: 'No current reel clip is selected, so I did not apply the requested edit.',
      mode: 'animate',
      directionContract: context.directionContract,
      sequence: context.sequence,
      continuity: null,
      canvasActions: [],
      reelActions: [reelAction('open_reel_studio')],
      suggestedActions: ['Apply cinematic look to all clips', 'Add local music', 'Render on this device'],
    };
  }

  const missingCaptionText = caption === null;
  const styleAction = hasStyle && !missingCaptionText
    ? reelAction('style_clips', {
      clipIds: targets.ids,
      effect,
      visualEffect,
      transition,
      motion,
      duration,
      caption: caption ?? null,
    })
    : null;
  const editDescriptions = [
    effect ? `${effectLabel(effect)} treatment` : null,
    visualEffect ? `${visualEffect} visual effect` : null,
    transition ? `${transition} transition` : null,
    motion ? `${motion} motion` : null,
    duration !== null ? `${duration}-second timing` : null,
    caption !== undefined && caption !== null ? (caption ? `caption “${caption}”` : 'caption removal') : null,
  ].filter((description): description is string => Boolean(description));
  const settingDescriptions = [
    settings.quality ? `${settings.quality} quality${settings.quality === 'high' ? ' (1080p)' : ''}` : null,
    settings.fps ? `${settings.fps} fps` : null,
    settings.aspectRatio ? settings.aspectRatio : null,
  ].filter((description): description is string => Boolean(description));
  const actions = [
    reelAction('open_reel_studio'),
    ...(hasSettings ? [reelAction('set_project', settings)] : []),
    ...(styleAction ? [styleAction] : []),
  ];
  let responseMessage = 'Opened Reel Studio for local still-image editing.';
  if (settingDescriptions.length) responseMessage = `Set the reel to ${settingDescriptions.join(', ')}.`;
  if (editDescriptions.length) responseMessage = `Applied ${editDescriptions.join(', ')} to ${targets.label}.`;
  if (settingDescriptions.length && editDescriptions.length) {
    responseMessage = `Set ${settingDescriptions.join(', ')}, then applied ${editDescriptions.join(', ')} to ${targets.label}.`;
  }
  if (missingCaptionText) {
    responseMessage = 'Reel Studio is open, but I need the caption text before applying a caption edit. Put the text in quotation marks.';
  }
  return {
    message: responseMessage,
    mode: 'animate',
    directionContract: context.directionContract,
    sequence: context.sequence,
    continuity: null,
    canvasActions: [],
    reelActions: actions,
    suggestedActions: ['Use high quality', 'Add local music', 'Render on this device'],
  };
}

export function createDemoResponse(message: string, context: DirectorContext): DirectorResponse {
  const reel = reelResponse(message, context);
  if (reel) return reel;

  const lower = message.toLowerCase();
  if (/\b(search|find|place|add)\b/.test(lower) && /\breferences?\b/.test(lower)) {
    return {
      message: 'The local library starts empty. Upload your own images, then I can help select them and define what the direction should inherit.',
      mode: 'inspect',
      directionContract: null,
      sequence: null,
      continuity: null,
      canvasActions: [],
      reelActions: [],
      suggestedActions: ['Upload two references', 'Choose inheritance channels'],
    };
  }
  const wantsStory = /visual story|storyboard|story beats|six-beat|build .*story|turn .*contract/.test(lower);
  if (wantsStory) {
    return {
      message: 'I converted the approved direction into six emotional beats. Each beat advances the story while the contract protects identity, silhouette, palette, and world.',
      mode: 'animate',
      directionContract: context.directionContract ?? buildContract(context),
      sequence: buildSequence(),
      continuity: null,
      canvasActions: [],
      reelActions: [],
      suggestedActions: ['Check continuity', 'Make Beat 04 more vulnerable', 'Export project'],
    };
  }

  if (/continuity|drift|validate|check/.test(lower)) {
    return {
      message: 'The sequence is coherent, but Beat 04 has drifted cooler and flatter than the emotional contract allows. I isolated one bounded repair.',
      mode: 'animate',
      directionContract: context.directionContract ?? buildContract(context),
      sequence: context.sequence ?? buildSequence(),
      continuity: {
        score: 94,
        findings: [{
          severity: 'warning',
          beatId: 'beat-4',
          issue: 'The face light is cooler and the expression reads detached instead of vulnerable.',
          repair: 'Warm the face key slightly and lower the gaze; preserve identity, framing, wardrobe, product, and world.',
        }],
      },
      canvasActions: [],
      reelActions: [],
      suggestedActions: ['Repair Beat 04', 'Show locked properties', 'Export project'],
    };
  }

  return {
    message: 'I compiled the selected references into one Direction Contract. The key conflict is resolved by keeping the world cold while softening only the subject light and expression.',
    mode: 'combine',
    directionContract: buildContract(context),
    sequence: null,
    continuity: null,
    canvasActions: [],
    reelActions: [],
    suggestedActions: ['Build visual story', 'Change material only', 'Show conflict resolution'],
  };
}
