(() => {
  const HOST_ID = "focus-friend-overlay-host";
  const DEFAULT_COOLDOWN_MINUTES = 20;
  const BREATH_CYCLE_MS = 6_000;

  let host = null;
  let shadow = null;
  let activeDomain = null;
  let settings = null;
  let copy = null;
  let view = "greeting";
  let cycleCount = 0;
  let breathingStartedAt = 0;
  let breathDeadline = 0;
  let cyclePhase = "in";
  let breathTimer = null;
  let transitionTimer = null;
  let factSelection = null;
  let ventDraft = "";
  let ventHits = 0;
  let ventIdleTimer = null;
  let ventResumeView = null;
  let ventWarningKind = "five";
  let ventTapTimer = null;
  let audioContext = null;
  const VENT_HITS_TO_COMPLETE = 30;
  const VENT_ROUNDS_PER_DAY = 20;

  function revealPage() {
    if (host) {
      host.remove();
      host = null;
      shadow = null;
    }
    if (breathTimer) {
      clearInterval(breathTimer);
      breathTimer = null;
    }
    if (transitionTimer) {
      clearTimeout(transitionTimer);
      transitionTimer = null;
    }
    if (ventIdleTimer) {
      clearTimeout(ventIdleTimer);
      ventIdleTimer = null;
    }
    if (ventTapTimer) {
      clearTimeout(ventTapTimer);
      ventTapTimer = null;
    }
    if (audioContext) {
      void audioContext.close().catch(() => {});
      audioContext = null;
    }
    ventDraft = "";
    ventHits = 0;
    ventResumeView = null;
    factSelection = null;
    document.documentElement?.style.setProperty("visibility", "visible", "important");
  }

  function prepareAudio() {
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) return null;
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextType();
    }
    if (audioContext.state === "suspended") void audioContext.resume().catch(() => {});
    return audioContext;
  }

  function playHitSound(kind) {
    const context = prepareAudio();
    if (!context) return;

    try {
      const now = context.currentTime;
      const isKick = kind === "kick";
      const noiseDuration = isKick ? 0.16 : 0.09;
      const noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * noiseDuration), context.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) {
        samples[index] = (Math.random() * 2 - 1) * (1 - index / samples.length);
      }

      const noise = context.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(isKick ? 650 : 1_450, now);
      const noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.exponentialRampToValueAtTime(isKick ? 0.12 : 0.085, now + 0.004);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDuration);
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(context.destination);
      noise.start(now);
      noise.stop(now + noiseDuration);

      const thump = context.createOscillator();
      const thumpGain = context.createGain();
      const thumpDuration = isKick ? 0.22 : 0.14;
      thump.type = "sine";
      thump.frequency.setValueAtTime(isKick ? 82 : 128, now);
      thump.frequency.exponentialRampToValueAtTime(isKick ? 38 : 58, now + thumpDuration);
      thumpGain.gain.setValueAtTime(0.0001, now);
      thumpGain.gain.exponentialRampToValueAtTime(isKick ? 0.16 : 0.11, now + 0.005);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + thumpDuration);
      thump.connect(thumpGain);
      thumpGain.connect(context.destination);
      thump.start(now);
      thump.stop(now + thumpDuration);
    } catch (error) {
      console.warn("Focus Friend could not play the soft impact sound:", error);
    }
  }

  function mountCover() {
    const page = document.documentElement;
    if (!page || host) return Boolean(host);

    host = document.createElement("div");
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .screen {
          box-sizing: border-box;
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          background: #171916;
          color: #f4f0e7;
          font: 16px/1.5 system-ui, sans-serif;
          text-align: center;
          pointer-events: auto;
        }
        .screen.fresh {
          background:
            radial-gradient(ellipse at 50% 12%, rgb(255 255 255 / 92%), transparent 46%),
            linear-gradient(145deg, #e5f4e9, #f7f5e9 58%, #deefea);
          color: #284b39;
        }
        .panel { position: relative; width: min(520px, 100%); }
        h1 { margin: 0 0 12px; font-size: clamp(26px, 5vw, 38px); line-height: 1.2; }
        p { margin: 0 0 22px; color: #d2d2c8; }
        .fresh p { color: #587461; }
        .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
        button {
          min-height: 46px;
          border: 0;
          border-radius: 999px;
          padding: 11px 20px;
          font: inherit;
          cursor: pointer;
        }
        button:focus-visible { outline: 3px solid #f4f0e7; outline-offset: 3px; }
        .primary { background: #c7dfb2; color: #171916; }
        .secondary { background: #30372f; color: #f4f0e7; }
        .fresh .primary { background: #46765a; color: #fff; box-shadow: 0 8px 22px rgb(55 104 69 / 18%); }
        .fresh .secondary { background: #e3eee4; color: #365943; }
        .fresh-orb {
          width: 122px;
          height: 122px;
          margin: 20px auto 26px;
          border: 1px solid rgb(255 255 255 / 80%);
          border-radius: 50%;
          background: radial-gradient(circle at 34% 28%, #fff 0, #d8efdc 47%, #a8d2b2 100%);
          box-shadow: 0 16px 42px rgb(66 119 79 / 16%);
          animation: float-gently 5s ease-in-out infinite;
        }
        @keyframes float-gently {
          0%, 100% { transform: scale(.96) translateY(2px); }
          50% { transform: scale(1.03) translateY(-3px); }
        }
        .breath-orb {
          width: 140px;
          height: 140px;
          margin: 20px auto;
          border: 1px solid rgb(255 255 255 / 85%);
          border-radius: 50%;
          background: radial-gradient(circle at 35% 28%, #fff, #d8efdc 65%, #a8d2b2);
          box-shadow: 0 14px 36px rgb(66 119 79 / 14%);
          transform: scale(1);
          transition: transform 3s ease-in-out;
        }
        .breath-orb.expand { transform: scale(1.3); }
        .breath-cue { margin: 12px 0; color: #365943; font-size: 18px; }
        .cycle-count { display: flex; align-items: baseline; justify-content: center; gap: 8px; }
        .count { color: #284b39; font-size: 36px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .count-label { color: #587461; }
        .timer { margin-bottom: 8px; color: #c7dfb2; font-size: 22px; font-variant-numeric: tabular-nums; }
        .fresh .timer { color: #46765a; }
        .vent-offer-button {
          display: block;
          margin: 14px auto 0;
          min-height: 40px;
          border: 1px solid #71806f;
          border-radius: 999px;
          padding: 8px 16px;
          background: #30372f;
          color: #f4f0e7;
          font: inherit;
          font-size: 14px;
        }
        .fact-intro { margin-bottom: 6px; color: #46765a; font-size: 14px; }
        .fact-text { color: #284b39; font-size: 17px; line-height: 1.5; }
        .screen.toast-mode {
          display: block;
          min-height: 0;
          padding: 0;
          background: transparent;
          pointer-events: none;
          text-align: left;
        }
        .toast-mode .panel {
          position: fixed;
          right: 18px;
          bottom: 18px;
          box-sizing: border-box;
          width: min(440px, calc(100vw - 36px));
          padding: 18px;
          border: 1px solid #d8e5d8;
          border-radius: 18px;
          background: #f7f8ef;
          color: #284b39;
          box-shadow: 0 12px 36px rgb(35 62 43 / 20%);
          pointer-events: auto;
          text-align: left;
        }
        .toast-mode h1 { margin-bottom: 14px; font-size: 19px; }
        .toast-mode .actions { justify-content: flex-end; }
        .toast-mode button { min-height: 40px; padding: 9px 14px; font-size: 14px; }
        .vent-editor { position: relative; width: 100%; margin-bottom: 18px; }
        .vent-textarea {
          width: 100%;
          min-height: 120px;
          box-sizing: border-box;
          border: 1px solid #c7dfb2;
          border-radius: 12px;
          padding: 12px;
          background: linear-gradient(160deg, #2c211a, #3a241a 65%, #2b201a);
          color: #fff2c2;
          caret-color: #ffb347;
          text-shadow: 0 0 2px #fff2a8, 0 0 7px #ff932e, 0 0 13px rgb(235 54 16 / 75%);
          font: inherit;
          font-size: 15px;
          line-height: 1.55;
          resize: vertical;
          animation: text-fire 900ms ease-in-out infinite alternate;
        }
        .vent-textarea::placeholder { color: #d1b69b; text-shadow: none; }
        @keyframes text-fire {
          from { text-shadow: 0 0 2px #fff2a8, 0 0 6px #ff932e, 0 0 11px rgb(235 54 16 / 62%); }
          to { text-shadow: 0 0 3px #fff7c6, 0 0 9px #ffad36, 0 0 16px rgb(235 54 16 / 82%); }
        }
        .vent-textarea.burning { animation: text-to-ash 950ms ease-in forwards; }
        @keyframes text-to-ash {
          0% { opacity: 1; filter: blur(0); transform: translateY(0) scale(1); }
          35% { color: #ffc36b; filter: blur(1px); }
          100% { opacity: 0; filter: blur(8px); transform: translateY(-70px) scale(.94); }
        }
        .vent-flare {
          position: absolute;
          z-index: 2;
          left: 50%;
          bottom: 4px;
          width: 100px;
          height: 112px;
          opacity: 0;
          pointer-events: none;
          background: radial-gradient(ellipse at 50% 82%, #fff9bd 0 9%, #ffc34d 24%, #ff6b24 47%, transparent 72%);
          filter: drop-shadow(0 0 18px rgb(255 102 24 / 68%));
          transform: translateX(-50%) scale(.25);
        }
        .vent-editor.burning .vent-flare { animation: flame-throw 950ms ease-out forwards; }
        @keyframes flame-throw {
          0% { opacity: 0; transform: translate(-50%, 22px) scale(.25); }
          25% { opacity: 1; transform: translate(-50%, 0) scale(1.25); }
          100% { opacity: 0; transform: translate(-50%, -145px) scale(1.7); }
        }
        .vent-ash {
          position: absolute;
          z-index: 3;
          bottom: 12px;
          left: var(--ash-x);
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #c8b9a6;
          opacity: 0;
          pointer-events: none;
        }
        .vent-editor.burning .vent-ash { animation: ash-rise 950ms ease-out var(--ash-delay) forwards; }
        @keyframes ash-rise {
          15% { opacity: .8; }
          100% { opacity: 0; transform: translate(var(--ash-drift), -125px) scale(.45); }
        }
        .vent-scene {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 8px;
          width: min(390px, 100%);
          height: 260px;
          margin: 8px auto 18px;
          overflow: hidden;
        }
        .vent-character { width: 145px; height: 235px; flex: 0 0 auto; overflow: visible; }
        .char-punch-arm { transform-box: fill-box; transform-origin: 8% 50%; }
        .char-kick-leg { transform-box: fill-box; transform-origin: 8% 15%; }
        .vent-character.punching .char-punch-arm { animation: character-punch 260ms ease-out; }
        .vent-character.kicking .char-kick-leg { animation: character-kick 320ms ease-out; }
        @keyframes character-punch {
          35% { transform: translate(20px, -5px) rotate(-9deg); }
          100% { transform: translate(0) rotate(0); }
        }
        @keyframes character-kick {
          35% { transform: translate(10px, -10px) rotate(-35deg); }
          100% { transform: translate(0) rotate(0); }
        }
        .vent-bag-wrap { display: flex; flex: 0 0 132px; flex-direction: column; align-items: center; height: 248px; transform-origin: top center; }
        .vent-bag-wrap.swinging { animation: bag-swing 280ms ease-out; }
        .vent-bag-wrap.kick-swing { animation: bag-kick-swing 340ms ease-out; }
        .bag-chain { width: 8px; height: 48px; border-inline: 2px solid #88908a; background: repeating-linear-gradient(180deg, #d7d9d4 0 4px, #555e59 4px 7px); }
        .vent-bag {
          position: relative;
          display: block;
          width: 112px;
          height: 186px;
          margin: 0;
          padding: 0;
          border: 2px solid #700c1b;
          border-radius: 46% 46% 35% 35% / 12% 12% 10% 10%;
          background: linear-gradient(90deg, #610817, #a40f24 18%, #e63847 43%, #c41a2d 76%, #680a19);
          box-shadow: inset 10px 0 14px rgb(255 255 255 / 15%), inset -12px 0 18px rgb(30 0 5 / 32%), 0 16px 25px rgb(25 20 17 / 22%);
          cursor: pointer;
          touch-action: none;
          overflow: hidden;
        }
        .bag-highlight { position: absolute; top: 14px; left: 23px; width: 18px; height: 125px; border-radius: 50%; background: rgb(255 255 255 / 13%); filter: blur(5px); }
        .bag-band { position: absolute; left: 0; right: 0; height: 9px; border-block: 1px solid rgb(255 255 255 / 22%); background: linear-gradient(90deg, #67101b, #a8202c, #68101c); }
        .bag-band.top { top: 38px; }
        .bag-band.bottom { bottom: 36px; }
        .bag-seam { position: absolute; top: 0; bottom: 0; left: 50%; width: 1px; background: rgb(60 0 8 / 24%); }
        .vent-bag.hit { animation: bag-shake 220ms ease; }
        .vent-bag.kick { animation: bag-kick 300ms ease; }
        .vent-bag-wrap.burst .vent-bag { animation: bag-burst 650ms ease forwards; }
        @keyframes bag-shake {
          0% { transform: rotate(0deg) scale(1); }
          30% { transform: rotate(-6deg) translateX(-3px); }
          60% { transform: rotate(5deg) translateX(3px); }
          100% { transform: rotate(0deg); }
        }
        @keyframes bag-kick {
          0% { transform: translateX(0) scale(1); }
          35% { transform: translateX(18px) rotate(8deg) scale(.96); }
          70% { transform: translateX(-8px) rotate(-4deg); }
          100% { transform: translateX(0) rotate(0); }
        }
        @keyframes bag-swing {
          0%, 100% { transform: rotate(0); }
          35% { transform: rotate(var(--swing-neg)); }
          72% { transform: rotate(var(--swing-pos)); }
        }
        @keyframes bag-kick-swing {
          0%, 100% { transform: rotate(0); }
          32% { transform: rotate(var(--swing-pos)); }
          68% { transform: rotate(var(--swing-neg)); }
        }
        @keyframes bag-burst {
          0% { transform: scale(1); opacity: 1; }
          45% { transform: scale(1.14); opacity: .9; }
          100% { transform: scale(.72); opacity: 0; }
        }
        .impact-particle { position: absolute; z-index: 2; left: 50%; top: 35%; pointer-events: none; font-size: 22px; animation: particle-pop 550ms ease-out forwards; }
        @keyframes particle-pop {
          from { opacity: 1; transform: translate(-50%, 0) scale(.75); }
          to { opacity: 0; transform: translate(calc(-50% + var(--drift)), -42px) scale(1.35); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fresh-orb { animation: none; }
          .breath-orb { transition: none; }
          .vent-textarea, .vent-textarea.burning, .vent-flare, .vent-ash,
          .vent-bag.hit, .vent-bag.kick, .vent-bag-wrap.swinging,
          .vent-bag-wrap.kick-swing, .vent-bag-wrap.burst,
          .impact-particle { animation-duration: 1ms; }
        }
      </style>
      <main class="screen">
        <section class="panel" role="dialog" aria-modal="true" aria-live="polite"></section>
      </main>
    `;
    page.appendChild(host);

    // The cover is mounted before the hidden page is made visible.
    page.style.setProperty("visibility", "visible", "important");
    return true;
  }

  function makePanel(title, message = "") {
    const panel = shadow.querySelector(".panel");
    panel.replaceChildren();

    const heading = document.createElement("h1");
    heading.textContent = title;
    panel.append(heading);

    if (message) {
      const paragraph = document.createElement("p");
      paragraph.textContent = message;
      panel.append(paragraph);
    }

    const actions = document.createElement("div");
    actions.className = "actions";
    panel.append(actions);
    return { panel, actions };
  }

  function addButton(actions, label, style, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = style;
    button.textContent = label;
    button.addEventListener("click", onClick);
    actions.append(button);
    return button;
  }

  function showGreeting() {
    view = "greeting";
    setFreshTheme(false);
    const { panel, actions } = makePanel(copy.interception.greeting);
    addButton(actions, copy.interception.letsGo, "primary", beginBreathingPrep);
    addButton(actions, copy.interception.notNow, "secondary", handleNotNow);

    const ventLink = document.createElement("button");
    ventLink.type = "button";
    ventLink.className = "vent-offer-button";
    ventLink.textContent = copy.interception.ventOfferLink;
    ventLink.addEventListener("click", showVentChoice);
    panel.append(ventLink);
  }

  function showNotNowResponse() {
    view = "notNow";
    setFreshTheme(false);
    makePanel(copy.interception.notNowResponse);
  }

  function showContinueCheckin() {
    view = "continueCheckin";
    setFreshTheme(true);
    shadow.querySelector(".screen").classList.add("toast-mode");
    const { panel, actions } = makePanel(copy.interception.continueCheckin);
    panel.classList.add("toast-panel");
    panel.setAttribute("role", "status");
    panel.removeAttribute("aria-modal");
    addButton(actions, copy.interception.keepPause, "secondary", revealPage);
    addButton(actions, copy.interception.disableSitePause, "primary", disablePauseForActiveSite);
    transitionTimer = setTimeout(revealPage, 10_000);
  }

  async function showFactReveal() {
    view = "factReveal";
    setFreshTheme(true);

    const numberFact = copy.number_facts[String(cycleCount)];
    const isSwerve = !numberFact;
    const facts = isSwerve ? copy.general_facts : null;
    const factIndex = isSwerve ? Math.floor(Math.random() * facts.length) : null;
    const factIntroPool = isSwerve ? copy.swerve_intro : copy.fact_intro;
    let replySlot = "default";
    try {
      const { last_cycle_count: lastCycleCount } = await chrome.storage.local.get("last_cycle_count");
      if (lastCycleCount === cycleCount && copy.cycle_reply.same_as_last.length) {
        replySlot = "same_as_last";
      }
      await chrome.storage.local.set({ last_cycle_count: cycleCount });
    } catch (error) {
      console.error("Focus Friend could not save the last cycle count:", error);
    }
    const introIndex = Math.floor(Math.random() * factIntroPool.length);
    const replyIndex = Math.floor(Math.random() * copy.cycle_reply[replySlot].length);

    factSelection = { isSwerve, factIndex, introIndex, replySlot, replyIndex };
    renderFactReveal();
  }

  function renderFactReveal() {
    if (!factSelection) return;
    view = "factReveal";
    setFreshTheme(true);

    const fact = factSelection.isSwerve
      ? copy.general_facts[factSelection.factIndex].text
      : copy.number_facts[String(cycleCount)].text;
    const introPool = factSelection.isSwerve ? copy.swerve_intro : copy.fact_intro;
    const reply = copy.cycle_reply[factSelection.replySlot][factSelection.replyIndex];
    const intro = introPool[factSelection.introIndex].replaceAll("{n}", String(cycleCount));
    const reaction = reply.replaceAll("{n}", String(cycleCount));
    const { panel, actions } = makePanel(String(cycleCount), reaction);

    const introLine = document.createElement("p");
    introLine.className = "fact-intro";
    introLine.textContent = intro;
    panel.insertBefore(introLine, actions);

    const factLine = document.createElement("p");
    factLine.className = "fact-text";
    factLine.textContent = fact;
    panel.insertBefore(factLine, actions);

    addButton(actions, copy.interception.backToWork, "primary", beginReturn);
  }

  function showVentChoice() {
    view = "ventChoice";
    setFreshTheme(true);
    const { actions } = makePanel(copy.vent.promptTitle);
    addButton(actions, copy.vent.writeDoor, "primary", startVentWrite);
    addButton(actions, copy.vent.punchDoor, "primary", requestVentRound);
    addButton(actions, copy.vent.backToWork, "secondary", showVentAfterExit);
  }

  function startVentWrite() {
    ventDraft = "";
    showVentWrite();
  }

  function showVentWrite() {
    view = "ventWrite";
    setFreshTheme(true);
    const { panel, actions } = makePanel(copy.vent.writeTitle, copy.vent.writeHint);

    const editor = document.createElement("div");
    editor.className = "vent-editor";
    const textarea = document.createElement("textarea");
    textarea.className = "vent-textarea";
    textarea.placeholder = copy.vent.writePlaceholder;
    textarea.value = ventDraft;
    textarea.addEventListener("input", () => {
      ventDraft = textarea.value;
      armVentIdleCheck(showVentWrite);
    });
    editor.append(textarea);

    const flare = document.createElement("div");
    flare.className = "vent-flare";
    flare.setAttribute("aria-hidden", "true");
    editor.append(flare);

    for (let index = 0; index < 9; index += 1) {
      const ash = document.createElement("span");
      ash.className = "vent-ash";
      ash.setAttribute("aria-hidden", "true");
      ash.style.setProperty("--ash-x", `${12 + Math.random() * 76}%`);
      ash.style.setProperty("--ash-delay", `${Math.random() * 180}ms`);
      ash.style.setProperty("--ash-drift", `${Math.round(Math.random() * 90 - 45)}px`);
      editor.append(ash);
    }
    panel.insertBefore(editor, actions);

    addButton(actions, copy.vent.burnButton, "primary", () => burnVentDraft(editor, textarea));
    textarea.focus();
    armVentIdleCheck(showVentWrite);
  }

  function burnVentDraft(editor, textarea) {
    if (view !== "ventWrite") return;
    clearVentIdleTimer();
    view = "ventBurning";
    editor.classList.add("burning");
    transitionTimer = setTimeout(() => {
      textarea.value = "";
      ventDraft = "";
      showVentBurned();
    }, 850);
  }

  function showVentBurned() {
    view = "ventBurned";
    const { actions } = makePanel(copy.vent.burnedMessage);
    transitionTimer = setTimeout(showVentAfterExit, 1_600);
  }

  async function readVentRoundsToday() {
    const today = localDayKey();
    const { vent_rounds_today: saved } = await chrome.storage.local.get("vent_rounds_today");
    if (saved?.day === today) {
      return {
        day: today,
        rounds: Number.isInteger(saved.rounds) ? saved.rounds : 0,
        fiveRoundWarningShown: Boolean(saved.fiveRoundWarningShown)
      };
    }

    const fresh = { day: today, rounds: 0, fiveRoundWarningShown: false };
    await chrome.storage.local.set({ vent_rounds_today: fresh });
    return fresh;
  }

  async function requestVentRound() {
    let progress;
    try {
      progress = await readVentRoundsToday();
    } catch (error) {
      console.error("Focus Friend could not read today's vent rounds:", error);
      startVentPunch();
      return;
    }

    if (progress.rounds >= VENT_ROUNDS_PER_DAY) {
      showVentDailyLimit();
      return;
    }
    if (progress.rounds > 10) {
      showVentRoundWarning("many");
      return;
    }
    if (progress.rounds > 5 && !progress.fiveRoundWarningShown) {
      progress.fiveRoundWarningShown = true;
      try {
        await chrome.storage.local.set({ vent_rounds_today: progress });
      } catch (error) {
        console.error("Focus Friend could not save the vent warning state:", error);
      }
      showVentRoundWarning("five");
      return;
    }

    startVentPunch();
  }

  function showVentRoundDone() {
    view = "ventRoundDone";
    setFreshTheme(true);
    const { actions } = makePanel(copy.vent.roundDone);
    addButton(actions, copy.vent.tryAgain, "primary", requestVentRound);
    addButton(actions, copy.vent.stopNow, "secondary", showVentAfterExit);
  }

  function showVentRoundWarning(kind) {
    view = "ventRoundWarning";
    ventWarningKind = kind;
    setFreshTheme(true);
    const message = kind === "five"
      ? copy.vent.fiveRoundWarning
      : copy.vent.manyRoundWarning;
    const { actions } = makePanel(message);
    addButton(actions, copy.vent.continueRound, "primary", startVentPunch);
    addButton(actions, copy.vent.stopNow, "secondary", showVentAfterExit);
  }

  function showVentDailyLimit() {
    view = "ventDailyLimit";
    setFreshTheme(true);
    const { actions } = makePanel(copy.vent.dailyLimit);
    addButton(actions, copy.vent.dailyLimitBack, "primary", beginReturn);
  }

  async function completeVentRound() {
    try {
      const progress = await readVentRoundsToday();
      progress.rounds = Math.min(VENT_ROUNDS_PER_DAY, progress.rounds + 1);
      await chrome.storage.local.set({ vent_rounds_today: progress });
      if (progress.rounds >= VENT_ROUNDS_PER_DAY) {
        showVentDailyLimit();
      } else {
        showVentRoundDone();
      }
    } catch (error) {
      console.error("Focus Friend could not save today's vent round:", error);
      showVentRoundDone();
    }
  }

  function startVentPunch() {
    ventHits = 0;
    showVentPunch();
  }

  function showVentPunch() {
    if (ventTapTimer) {
      clearTimeout(ventTapTimer);
      ventTapTimer = null;
    }
    view = "ventPunch";
    setFreshTheme(true);
    const { panel, actions } = makePanel(copy.vent.punchTitle, copy.vent.punchHint);

    const scene = document.createElement("div");
    scene.className = "vent-scene";
    scene.innerHTML = `
      <svg class="vent-character" viewBox="0 0 150 240" aria-hidden="true">
        <ellipse cx="72" cy="229" rx="39" ry="7" fill="rgb(35 50 40 / 12%)" />
        <path d="M55 143 L45 194 L33 199" fill="none" stroke="#315642" stroke-width="15" stroke-linecap="round" />
        <path class="char-kick-leg" d="M82 143 L91 180 L111 185" fill="none" stroke="#315642" stroke-width="15" stroke-linecap="round" />
        <path d="M24 199 Q34 192 47 197 L49 205 L24 207Z" fill="#d53a43" stroke="#7d1620" stroke-width="3" />
        <path d="M102 183 Q114 177 126 184 L130 191 L105 194Z" fill="#d53a43" stroke="#7d1620" stroke-width="3" />
        <path d="M50 78 Q70 66 91 80 L99 145 Q74 158 47 144Z" fill="#7fb58a" stroke="#315642" stroke-width="4" />
        <path d="M53 91 Q37 100 31 119" fill="none" stroke="#e9b994" stroke-width="11" stroke-linecap="round" />
        <circle cx="31" cy="121" r="10" fill="#d53a43" stroke="#7d1620" stroke-width="3" />
        <g class="char-punch-arm">
          <path d="M88 91 Q103 91 115 82 L125 78" fill="none" stroke="#e9b994" stroke-width="12" stroke-linecap="round" />
          <circle cx="127" cy="77" r="13" fill="#d53a43" stroke="#7d1620" stroke-width="3" />
          <path d="M119 74 L133 79" stroke="#f4a3a4" stroke-width="3" stroke-linecap="round" />
        </g>
        <circle cx="69" cy="49" r="25" fill="#efc7a4" stroke="#8c5d49" stroke-width="3" />
        <path d="M45 47 Q45 19 71 22 Q92 24 95 46 Q84 37 72 37 Q58 37 45 47Z" fill="#42322c" />
        <circle cx="61" cy="51" r="2.7" fill="#302722" />
        <circle cx="77" cy="51" r="2.7" fill="#302722" />
        <path d="M62 63 Q69 69 77 63" fill="none" stroke="#8c5149" stroke-width="2.5" stroke-linecap="round" />
        <path d="M55 79 Q70 87 87 78" fill="none" stroke="#e0b333" stroke-width="5" />
      </svg>
      <div class="vent-bag-wrap">
        <div class="bag-chain" aria-hidden="true"></div>
        <button class="vent-bag" type="button" aria-label="${copy.vent.punchDoor}">
          <span class="bag-highlight" aria-hidden="true"></span>
          <span class="bag-seam" aria-hidden="true"></span>
          <span class="bag-band top" aria-hidden="true"></span>
          <span class="bag-band bottom" aria-hidden="true"></span>
        </button>
      </div>
    `;
    panel.insertBefore(scene, actions);

    const bag = scene.querySelector(".vent-bag");
    const character = scene.querySelector(".vent-character");
    const bagWrap = scene.querySelector(".vent-bag-wrap");

    let pointerStart = null;
    let ignoreClickUntil = 0;
    const hit = (kind = "punch") => {
      if (view !== "ventPunch") return;
      playHitSound(kind);
      ventHits += 1;
      bag.classList.remove("hit", "kick");
      void bag.offsetWidth;
      bag.classList.add(kind === "kick" ? "kick" : "hit");
      const swing = Math.min(25, 8 + ventHits * 0.35);
      bagWrap.style.setProperty("--swing-neg", `-${swing}deg`);
      bagWrap.style.setProperty("--swing-pos", `${swing}deg`);
      bagWrap.classList.remove("swinging", "kick-swing");
      void bagWrap.offsetWidth;
      bagWrap.classList.add(kind === "kick" ? "kick-swing" : "swinging");
      character.classList.remove("punching", "kicking");
      void character.getBoundingClientRect();
      character.classList.add(kind === "kick" ? "kicking" : "punching");
      addVentParticle(bag);
      armVentIdleCheck(showVentPunch);

      if (ventHits >= VENT_HITS_TO_COMPLETE) {
        clearVentIdleTimer();
        bag.disabled = true;
        for (let index = 0; index < 12; index += 1) addVentParticle(bag, true);
        bagWrap.classList.add("burst");
        transitionTimer = setTimeout(() => void completeVentRound(), 650);
      }
    };

    bag.addEventListener("pointerdown", (event) => {
      pointerStart = { x: event.clientX, y: event.clientY };
      bag.setPointerCapture(event.pointerId);
    });
    bag.addEventListener("pointerup", (event) => {
      if (!pointerStart) return;
      const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
      pointerStart = null;
      if (distance > 40) {
        if (ventTapTimer) {
          clearTimeout(ventTapTimer);
          ventTapTimer = null;
        }
        ignoreClickUntil = performance.now() + 500;
        hit("kick");
      }
    });
    bag.addEventListener("click", () => {
      prepareAudio();
      if (performance.now() < ignoreClickUntil) {
        ignoreClickUntil = 0;
        return;
      }
      if (ventTapTimer) {
        clearTimeout(ventTapTimer);
        ventTapTimer = null;
        hit("kick");
      } else {
        ventTapTimer = setTimeout(() => {
          ventTapTimer = null;
          hit("punch");
        }, 220);
      }
    });

    armVentIdleCheck(showVentPunch);
  }

  function addVentParticle(bag, isBurst = false) {
    const particle = document.createElement("span");
    particle.className = "impact-particle";
    const burstParticles = copy.vent.burstParticles;
    particle.textContent = isBurst && burstParticles.length
      ? burstParticles[Math.floor(Math.random() * burstParticles.length)]
      : copy.vent.hitParticle;
    particle.style.setProperty("--drift", `${Math.round(Math.random() * 70 - 35)}px`);
    if (isBurst) {
      particle.style.left = `${35 + Math.random() * 30}%`;
      particle.style.top = `${28 + Math.random() * 18}%`;
      shadow.querySelector(".panel").append(particle);
    } else {
      bag.append(particle);
    }
    setTimeout(() => particle.remove(), 600);
  }

  function armVentIdleCheck(resumeView) {
    clearVentIdleTimer();
    ventIdleTimer = setTimeout(() => showVentIdleCheck(resumeView), 25_000);
  }

  function clearVentIdleTimer() {
    if (ventIdleTimer) {
      clearTimeout(ventIdleTimer);
      ventIdleTimer = null;
    }
  }

  function showVentIdleCheck(resumeView) {
    clearVentIdleTimer();
    view = "ventIdleCheck";
    ventResumeView = resumeView;
    const { actions } = makePanel(copy.vent.idleCheck);
    addButton(actions, copy.vent.idleYes, "primary", showVentAfterExit);
    addButton(actions, copy.vent.idleContinue, "secondary", resumeView);
  }

  function showVentAfterExit() {
    clearVentIdleTimer();
    if (ventTapTimer) {
      clearTimeout(ventTapTimer);
      ventTapTimer = null;
    }
    ventDraft = "";
    ventHits = 0;
    view = "ventAfter";
    setFreshTheme(true);
    const { actions } = makePanel(copy.vent.afterExit);
    addButton(actions, copy.vent.backToWork, "primary", beginReturn);
  }

  function showBreathingPrep() {
    view = "breathingPrep";
    setFreshTheme(true);
    const { panel, actions } = makePanel(
      copy.interception.breathingPrepTitle,
      copy.interception.breathingPrepHint
    );

    const orb = document.createElement("div");
    orb.className = "fresh-orb";
    orb.setAttribute("aria-hidden", "true");
    panel.insertBefore(orb, actions);

    const startButton = addButton(
      actions,
      copy.interception.startBreathing,
      "primary",
      startBreathing
    );
    startButton.focus();
  }

  function beginBreathingPrep() {
    if (view !== "greeting") return;
    showBreathingPrep();
  }

  function showBreathing() {
    view = "breathing";
    setFreshTheme(true);
    const { panel, actions } = makePanel(
      copy.interception.breathingTitle,
      copy.interception.breathingHint
    );

    const timer = document.createElement("div");
    timer.className = "timer";
    timer.setAttribute("aria-live", "off");
    panel.insertBefore(timer, actions);

    const orb = document.createElement("div");
    orb.className = "breath-orb";
    orb.classList.toggle("expand", cyclePhase === "in");
    orb.setAttribute("aria-hidden", "true");

    const cue = document.createElement("p");
    cue.className = "breath-cue";
    cue.setAttribute("aria-live", "polite");
    cue.textContent = cyclePhase === "in"
      ? copy.interception.breatheIn
      : copy.interception.breatheOut;

    const cycleDisplay = document.createElement("div");
    cycleDisplay.className = "cycle-count";
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = String(cycleCount);

    const countLabel = document.createElement("span");
    countLabel.className = "count-label";
    countLabel.textContent = copy.interception.cycleCount;
    cycleDisplay.append(count, countLabel);

    panel.insertBefore(orb, actions);
    panel.insertBefore(cue, actions);
    panel.insertBefore(cycleDisplay, actions);

    addButton(actions, copy.interception.doneEarly, "secondary", finishBreathing);
    updateBreathTimer();
  }

  function showReturning() {
    view = "returning";
    setFreshTheme(true);
    makePanel(copy.interception.returning);
  }

  function setFreshTheme(isFresh) {
    shadow.querySelector(".screen").classList.toggle("fresh", isFresh);
  }

  function renderCurrentView() {
    if (!copy || !host) return;
    if (view === "greeting") showGreeting();
    else if (view === "notNow") showNotNowResponse();
    else if (view === "continueCheckin") showContinueCheckin();
    else if (view === "breathingPrep") showBreathingPrep();
    else if (view === "breathing") showBreathing();
    else if (view === "factReveal") renderFactReveal();
    else if (view === "ventChoice") showVentChoice();
    else if (view === "ventWrite") showVentWrite();
    else if (view === "ventBurned") showVentBurned();
    else if (view === "ventPunch") showVentPunch();
    else if (view === "ventIdleCheck") showVentIdleCheck(ventResumeView);
    else if (view === "ventRoundDone") showVentRoundDone();
    else if (view === "ventRoundWarning") showVentRoundWarning(ventWarningKind);
    else if (view === "ventDailyLimit") showVentDailyLimit();
    else if (view === "ventAfter") showVentAfterExit();
    else if (view === "returning") showReturning();
  }

  async function readSettings() {
    return chrome.storage.sync.get({
      enabled: true,
      enabled_sites: [],
      language: "bn",
      debounce_minutes: DEFAULT_COOLDOWN_MINUTES,
      continue_checkin_enabled: false
    });
  }

  function findMatchingDomain(enabledSites) {
    const hostname = location.hostname.toLowerCase();
    return enabledSites
      .filter((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
      .sort((first, second) => second.length - first.length)[0] || null;
  }

  async function loadCopy(language) {
    const result = await chrome.runtime.sendMessage({ type: "getCopy", language });
    if (result?.error) throw new Error(result.error);
    return result;
  }

  async function wasRecentlyShown(domain, minutes) {
    const { last_site_hit = {} } = await chrome.storage.local.get("last_site_hit");
    const lastHit = last_site_hit[domain];
    return Boolean(lastHit && Date.now() - lastHit < minutes * 60 * 1000);
  }

  async function rememberSiteHit() {
    if (!activeDomain) return;
    const { last_site_hit = {} } = await chrome.storage.local.get("last_site_hit");
    await chrome.storage.local.set({
      last_site_hit: { ...last_site_hit, [activeDomain]: Date.now() }
    });
  }

  function localDayKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }

  async function recordNotNowChoice() {
    if (!settings?.continue_checkin_enabled || !activeDomain) return false;

    const today = localDayKey();
    const { not_now_daily_counts: previous } = await chrome.storage.local.get("not_now_daily_counts");
    const record = previous?.day === today
      ? previous
      : { day: today, counts: {}, shown: [] };
    const counts = { ...record.counts };
    const shown = Array.isArray(record.shown) ? [...record.shown] : [];

    counts[activeDomain] = (counts[activeDomain] || 0) + 1;
    const shouldShow = counts[activeDomain] > 5 && !shown.includes(activeDomain);
    if (shouldShow) shown.push(activeDomain);

    await chrome.storage.local.set({
      not_now_daily_counts: { day: today, counts, shown }
    });
    return shouldShow;
  }

  async function disablePauseForActiveSite() {
    const saved = await chrome.storage.sync.get({ enabled_sites: [] });
    const enabledSites = Array.isArray(saved.enabled_sites) ? saved.enabled_sites : [];
    await chrome.storage.sync.set({
      enabled_sites: enabledSites.filter((domain) => domain !== activeDomain)
    });
    revealPage();
  }

  function startBreathing() {
    cycleCount = 0;
    factSelection = null;
    breathingStartedAt = performance.now();
    breathDeadline = breathingStartedAt + 60_000;
    cyclePhase = "in";
    showBreathing();
    if (breathTimer) clearInterval(breathTimer);
    breathTimer = setInterval(updateBreathTimer, 100);
  }

  function updateBreathTimer() {
    if (view !== "breathing" || !shadow) return;
    const timer = shadow.querySelector(".timer");
    if (!timer) return;

    const elapsed = Math.max(0, performance.now() - breathingStartedAt);
    const boundedElapsed = Math.min(elapsed, 60_000);
    const completedCycles = Math.floor(boundedElapsed / BREATH_CYCLE_MS);
    if (completedCycles !== cycleCount) {
      cycleCount = completedCycles;
      const count = shadow.querySelector(".count");
      if (count) count.textContent = String(cycleCount);
    }

    const nextPhase = boundedElapsed % BREATH_CYCLE_MS < BREATH_CYCLE_MS / 2 ? "in" : "out";
    if (nextPhase !== cyclePhase) {
      cyclePhase = nextPhase;
      const orb = shadow.querySelector(".breath-orb");
      const cue = shadow.querySelector(".breath-cue");
      if (orb) orb.classList.toggle("expand", cyclePhase === "in");
      if (cue) {
        cue.textContent = cyclePhase === "in"
          ? copy.interception.breatheIn
          : copy.interception.breatheOut;
      }
    }

    const secondsLeft = Math.max(0, Math.ceil((breathDeadline - performance.now()) / 1000));
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    timer.textContent = `${copy.interception.timeLeft}: ${formattedTime}`;
    if (secondsLeft === 0) finishBreathing();
  }

  function finishBreathing() {
    if (view !== "breathing") return;
    if (breathTimer) {
      clearInterval(breathTimer);
      breathTimer = null;
    }
    cycleCount = Math.floor(Math.min(60_000, Math.max(0, performance.now() - breathingStartedAt)) / BREATH_CYCLE_MS);
    void showFactReveal();
  }

  async function handleNotNow() {
    if (view !== "greeting") return;
    view = "processingNotNow";
    let shouldShowCheckin = false;
    try {
      shouldShowCheckin = await recordNotNowChoice();
    } catch (error) {
      console.error("Focus Friend could not save the optional check-in count:", error);
    }
    try {
      await rememberSiteHit();
    } catch (error) {
      console.error("Focus Friend could not save the site cooldown:", error);
    }

    if (shouldShowCheckin) {
      showContinueCheckin();
      return;
    }
    showNotNowResponse();
    transitionTimer = setTimeout(revealPage, 900);
  }

  async function beginReturn() {
    showReturning();
    await rememberSiteHit();
    transitionTimer = setTimeout(revealPage, 2500);
  }

  async function checkAndShow(coverImmediately = false) {
    try {
      if (coverImmediately && !mountCover()) return;

      settings = await readSettings();
      activeDomain = settings.enabled ? findMatchingDomain(settings.enabled_sites) : null;
      if (!activeDomain) {
        revealPage();
        return;
      }

      if (await wasRecentlyShown(activeDomain, settings.debounce_minutes)) {
        revealPage();
        return;
      }

      copy = await loadCopy(settings.language);
      if (!host) mountCover();
      view = "greeting";
      showGreeting();
    } catch (error) {
      console.error("Focus Friend could not show the pause screen:", error);
      revealPage();
    }
  }

  function start() {
    if (document.documentElement) {
      mountCover();
      void checkAndShow();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!document.documentElement) return;
      observer.disconnect();
      mountCover();
      void checkAndShow();
    });
    observer.observe(document, { childList: true, subtree: true });
  }

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "sync") return;

    const latest = await readSettings();
    const matchingDomain = latest.enabled
      ? findMatchingDomain(latest.enabled_sites)
      : null;

    if (!matchingDomain) {
      revealPage();
      return;
    }

    if ("continue_checkin_enabled" in changes) {
      settings = latest;
      if (!latest.continue_checkin_enabled && view === "continueCheckin") {
        revealPage();
        return;
      }
    }

    if ("language" in changes && host) {
      settings = latest;
      copy = await loadCopy(settings.language);
      renderCurrentView();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !host) {
      void checkAndShow();
    }
  });

  start();
})();
