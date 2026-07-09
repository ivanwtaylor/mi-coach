(function () {
  'use strict';

  const workbook = window.MI_COACH_WORKBOOK || { sheets: [], prompts: {} };

  const topicNames = {
    0: 'general',
    1: 'exercise',
    2: 'diet',
    3: 'medication',
    4: 'sleep',
    5: 'stress',
    6: 'weight',
    7: 'glucose'
  };

  class MICoach {
    constructor(data) {
      this.data = data;
      this.prompts = data.prompts || {};
      this.active = false;
      this.finished = false;
      this.resetState();
    }

    resetState() {
      this.stage = 1;
      this.turnNo = 0;
      this.topicCur = 0;
      this.changeC = 0;
      this.sustainC = 0;
      this.discordC = 0;
      this.neutralC = 0;
      this.reflectC = 0;
      this.questionC = 0;
      this.openQC = 0;
      this.affirmC = 0;
      this.summaryC = 0;
      this.closedQC = 0;
      this.nonAdh = 0;
      this.waitConf = 0;
      this.ataState = 0;
      this.ataTopic = 0;
      this.ataC = 0;
      this.lastStep = '';
      this.sessionLog = [];
      this.scorecard = [];
      this.messages = [];
      this.active = false;
      this.finished = false;
    }

    start() {
      this.resetState();
      this.active = true;
      const response = this.nextPrompt('engage_open.txt');
      const ruleCode = 'ENG-001';
      const tech = 'OPEN_QUESTION';
      this.countTech(tech);
      this.addCoachMessage(response, ruleCode, tech, 0);
      return response;
    }

    send(userRaw) {
      if (!this.active || this.finished) return null;
      const raw = String(userRaw || '').trim();
      if (!raw) return null;

      const userIn = raw.toUpperCase();
      this.turnNo += 1;

      let conf = -1;
      let topic = 0;
      let classCode = 4;

      const classified = this.classify(userIn);
      classCode = classified.classCode;
      topic = classified.topic;

      if (classCode === 1) this.changeC += 1;
      if (classCode === 2) this.sustainC += 1;
      if (classCode === 3) this.discordC += 1;
      if (classCode === 4) this.neutralC += 1;

      let currentTopic = this.topicCur;
      if (topic > 0) {
        this.topicCur = topic;
        currentTopic = topic;
      }

      this.addUserMessage(raw, classCode);

      let response = '';
      let ruleCode = '';
      let tech = '';
      let completed = false;

      if (this.stage < 4) {
        if (this.ataState === 1) {
          if (classCode === 3 || this.declinesInfo(userIn)) {
            this.ataState = 0;
            this.ataTopic = 0;
            response = 'Okay. What feels most important right now?';
            ruleCode = 'ATA-009';
            tech = 'AUTONOMY_SUPPORT_OPEN_QUESTION';
          } else {
            response = this.nextATAPrompt('tell', this.ataTopic) + ' ' + this.nextATAPrompt('ask2', this.ataTopic);
            ruleCode = 'ATA-002';
            tech = 'OPEN_QUESTION';
            this.ataState = 2;
            this.ataC += 1;
          }
          this.countTech(tech);
          this.addCoachMessage(response, ruleCode, tech, this.turnNo);
          return { response, completed: false };
        }

        if (this.wantsInfo(userIn) && currentTopic > 0 && classCode !== 3) {
          this.stage = 3;
          this.ataTopic = currentTopic;
          response = this.nextATAPrompt('ask1', this.ataTopic);
          ruleCode = 'ATA-001';
          tech = 'OPEN_QUESTION';
          this.ataState = 1;
          this.countTech(tech);
          this.addCoachMessage(response, ruleCode, tech, this.turnNo);
          return { response, completed: false };
        }

        if (this.ataState === 2) {
          this.ataState = 0;
          this.ataTopic = 0;
        }
      }

      if (this.stage === 1) {
        if (classCode === 3) {
          response = this.nextPrompt('evoke_discord.txt');
          ruleCode = 'ENG-009';
          tech = 'AUTONOMY_SUPPORT';
        } else if (this.turnNo >= 2) {
          this.stage = 2;
          if (currentTopic > 0) {
            response = this.nextPrompt('focus_confirm.txt');
            ruleCode = 'FOC-002';
            tech = 'SUMMARY';
            this.stage = 3;
          } else {
            response = this.nextPrompt('focus_topics.txt');
            ruleCode = 'FOC-001';
            tech = 'SUMMARY_OPEN_QUESTION';
          }
        } else {
          response = this.nextPrompt('engage_reflect.txt');
          ruleCode = 'ENG-003';
          tech = 'REFLECTION';
        }
      } else if (this.stage === 2) {
        if (classCode === 3) {
          response = this.nextPrompt('evoke_discord.txt');
          ruleCode = 'FOC-009';
          tech = 'AUTONOMY_SUPPORT';
        } else if (currentTopic > 0) {
          this.stage = 3;
          response = this.nextPrompt('focus_confirm.txt');
          ruleCode = 'FOC-002';
          tech = 'SUMMARY';
        } else {
          response = this.nextPrompt('focus_topics.txt');
          ruleCode = 'FOC-001';
          tech = 'SUMMARY_OPEN_QUESTION';
        }
      } else if (this.stage === 3) {
        if (classCode === 3) {
          response = this.nextPrompt('evoke_discord.txt');
          ruleCode = 'EVK-099';
          tech = 'AUTONOMY_SUPPORT';
        } else if (this.changeC >= 2 && this.changeC >= this.sustainC + 1) {
          this.stage = 4;
          this.waitConf = 0;
          response = this.nextPrompt('planning_smallstep.txt');
          ruleCode = 'PLN-001';
          tech = 'OPEN_QUESTION';
        } else if (classCode === 1) {
          response = this.nextPrompt('evoke_change.txt');
          ruleCode = 'EVK-002';
          tech = 'AFFIRM_REFLECTION';
        } else if (classCode === 2) {
          response = this.nextPrompt('evoke_sustain.txt');
          ruleCode = 'EVK-009';
          tech = 'REFLECTION';
        } else {
          response = this.nextPrompt('evoke_neutral.txt');
          ruleCode = 'EVK-010';
          tech = 'OPEN_QUESTION';
        }
      } else if (this.stage === 4) {
        if (this.waitConf === 1) {
          conf = this.extractScale(userIn);
          if (conf >= 7) {
            response = this.buildFinalAffirmation(this.nextPrompt('planning_highconf.txt'));
            ruleCode = 'PLN-004';
            tech = 'SUMMARY_AFFIRMATION';
            this.countTech(tech);
            this.addCoachMessage(response, ruleCode, tech, this.turnNo);
            this.writeScorecard();
            this.finished = true;
            this.active = false;
            completed = true;
            return { response, completed };
          }
          if (conf < 7) {
            response = this.nextPrompt('planning_lowconf.txt');
            ruleCode = 'PLN-003';
            tech = 'OPEN_QUESTION';
            this.waitConf = 0;
          }
        } else {
          this.lastStep = raw;
          response = this.nextPrompt('planning_confidence.txt');
          ruleCode = 'PLN-002';
          tech = 'CLOSED_QUESTION';
          this.waitConf = 1;
        }
      }

      this.countTech(tech);
      this.addCoachMessage(response, ruleCode, tech, this.turnNo);
      return { response, completed };
    }

    nextPrompt(sheetName) {
      const arr = this.prompts[sheetName];
      if (!arr || arr.length === 0) return `Prompt file missing: ${sheetName}`;
      const idx = Math.floor(Math.random() * arr.length);
      return String(arr[idx]);
    }

    nextATAPrompt(kind, topic) {
      const prefix = topicNames[topic] || 'general';
      let sheetName;
      if (topic === 0 || prefix === 'general') {
        sheetName = kind === 'ask1' ? 'ata_ask1.txt' : kind === 'tell' ? 'ata_tell.txt' : 'ata_ask2.txt';
      } else {
        sheetName = `ata_${prefix}_${kind}.txt`;
      }
      return this.nextPrompt(sheetName);
    }

    addCoachMessage(text, ruleCode, tech, turn) {
      this.messages.push({ who: 'AI', text, ruleCode, tech });
      this.writeLog(turn, 'AI', text, ruleCode, tech);
    }

    addUserMessage(text, classCode) {
      const cName = classCode === 1 ? 'CHANGE_TALK' : classCode === 2 ? 'SUSTAIN_TALK' : classCode === 3 ? 'DISCORD' : 'NEUTRAL';
      this.messages.push({ who: 'USER', text, classCode: cName });
      this.sessionLog.push(`${this.padInt(this.turnNo, 4)}  USER  ${this.cleanOneLine(text)}  ${cName}`);
    }

    writeLog(turnNo, whoText, textValue, ruleCode, tech) {
      this.sessionLog.push(`${this.padInt(turnNo, 4)}  ${whoText}  ${this.cleanOneLine(textValue)}  ${ruleCode}  ${tech}`);
    }

    writeScorecard() {
      const ratio = this.questionC > 0 ? this.reflectC / this.questionC : 0;
      const pctOpen = this.questionC > 0 ? 100 * this.openQC / this.questionC : 0;
      this.scorecard = [
        'MI ADHERENCE SCORECARD',
        '---------------------',
        `Final stage reached: ${this.padInt(this.stage, 6)}`,
        `Agreed action:       ${this.cleanOneLine(this.lastStep)}`,
        `Change talk count:   ${this.padInt(this.changeC, 6)}`,
        `Sustain talk count:  ${this.padInt(this.sustainC, 6)}`,
        `Discord count:       ${this.padInt(this.discordC, 6)}`,
        `Neutral count:       ${this.padInt(this.neutralC, 6)}`,
        `Reflections:         ${this.padInt(this.reflectC, 6)}`,
        `Questions:           ${this.padInt(this.questionC, 6)}`,
        `Open questions:      ${this.padInt(this.openQC, 6)}`,
        `Closed questions:    ${this.padInt(this.closedQC, 6)}`,
        `Affirmations:        ${this.padInt(this.affirmC, 6)}`,
        `Summaries:           ${this.padInt(this.summaryC, 6)}`,
        `Ask-Tell-Ask uses:   ${this.padInt(this.ataC, 6)}`,
        `Non-adherent count:  ${this.padInt(this.nonAdh, 6)}`,
        `Reflection/question ratio: ${this.padNumber(ratio, 8, 2)}`,
        `Open question share: ${this.padNumber(pctOpen, 8, 2)} %`
      ];
      return this.scorecard;
    }

    liveScorecardLines() {
      if (this.scorecard.length) return this.scorecard;
      const ratio = this.questionC > 0 ? this.reflectC / this.questionC : 0;
      const pctOpen = this.questionC > 0 ? 100 * this.openQC / this.questionC : 0;
      return [
        'LIVE MI ADHERENCE SCORECARD',
        '--------------------------',
        `Current stage:       ${this.padInt(this.stage, 6)}`,
        `Change talk count:   ${this.padInt(this.changeC, 6)}`,
        `Sustain talk count:  ${this.padInt(this.sustainC, 6)}`,
        `Discord count:       ${this.padInt(this.discordC, 6)}`,
        `Neutral count:       ${this.padInt(this.neutralC, 6)}`,
        `Reflections:         ${this.padInt(this.reflectC, 6)}`,
        `Questions:           ${this.padInt(this.questionC, 6)}`,
        `Open questions:      ${this.padInt(this.openQC, 6)}`,
        `Closed questions:    ${this.padInt(this.closedQC, 6)}`,
        `Affirmations:        ${this.padInt(this.affirmC, 6)}`,
        `Summaries:           ${this.padInt(this.summaryC, 6)}`,
        `Ask-Tell-Ask uses:   ${this.padInt(this.ataC, 6)}`,
        `Reflection/question ratio: ${this.padNumber(ratio, 8, 2)}`,
        `Open question share: ${this.padNumber(pctOpen, 8, 2)} %`
      ];
    }

    classify(inputText) {
      let c = 0;
      let s = 0;
      let topic = 0;

      if (this.contains(inputText, 'EXERCISE') || this.contains(inputText, 'WALK') || this.contains(inputText, 'ACTIVE') || this.contains(inputText, 'GYM')) topic = 1;
      if (this.contains(inputText, 'DIET') || this.contains(inputText, 'FOOD') || this.contains(inputText, 'EAT') || this.contains(inputText, 'MEAL') || this.contains(inputText, 'SNACK') || this.contains(inputText, 'CARB')) topic = 2;
      if (this.contains(inputText, 'MEDICATION') || this.contains(inputText, 'MEDICINE') || this.contains(inputText, 'INSULIN') || this.contains(inputText, 'PILL')) topic = 3;
      if (this.contains(inputText, 'SLEEP')) topic = 4;
      if (this.contains(inputText, 'STRESS') || this.contains(inputText, 'ANXIOUS') || this.contains(inputText, 'ANXIETY')) topic = 5;
      if (this.contains(inputText, 'WEIGHT')) topic = 6;
      if (this.contains(inputText, 'BLOOD SUGAR') || this.contains(inputText, 'GLUCOSE') || this.contains(inputText, 'A1C')) topic = 7;

      if (this.contains(inputText, 'POINTLESS') || this.contains(inputText, "DON'T UNDERSTAND") || this.contains(inputText, 'DONT UNDERSTAND') || this.contains(inputText, 'LEAVE ME ALONE') || this.contains(inputText, 'STUPID') || this.contains(inputText, "ISN'T HELPING") || this.contains(inputText, 'ISNT HELPING') || this.contains(inputText, 'YOU ARE WRONG')) {
        return { classCode: 3, topic };
      }

      if (this.contains(inputText, 'I WANT') || this.contains(inputText, 'I WOULD LIKE') || this.contains(inputText, 'I CAN') || this.contains(inputText, 'I COULD') || this.contains(inputText, 'IMPORTANT') || this.contains(inputText, 'I NEED') || this.contains(inputText, 'I HAVE TO') || this.contains(inputText, 'I WILL') || this.contains(inputText, 'I PLAN') || this.contains(inputText, 'READY') || this.contains(inputText, 'BETTER') || this.contains(inputText, 'HEALTHIER')) c += 1;

      if (this.contains(inputText, "CAN'T") || this.contains(inputText, 'CANT') || this.contains(inputText, 'NOT READY') || this.contains(inputText, 'NO TIME') || this.contains(inputText, 'TOO HARD') || this.contains(inputText, 'HARD') || this.contains(inputText, 'DIFFICULT') || this.contains(inputText, 'EXHAUSTED') || this.contains(inputText, 'INTIMIDATING') || this.contains(inputText, 'AFRAID') || this.contains(inputText, 'WORRIED') || this.contains(inputText, 'NOT SURE')) s += 1;

      if (c > s && c > 0) return { classCode: 1, topic };
      if (s > 0) return { classCode: 2, topic };
      return { classCode: 4, topic };
    }

    wantsInfo(inputText) {
      return this.contains(inputText, 'TELL ME') || this.contains(inputText, 'EXPLAIN') || this.contains(inputText, 'WHAT SHOULD I DO') || this.contains(inputText, 'WHAT CAN I DO') || this.contains(inputText, 'HOW DO I') || this.contains(inputText, 'WHAT DO YOU RECOMMEND') || this.contains(inputText, 'WHAT WOULD YOU SUGGEST') || this.contains(inputText, 'ANY ADVICE') || this.contains(inputText, 'ADVICE') || this.contains(inputText, 'RECOMMEND') || this.contains(inputText, 'SUGGEST') || this.contains(inputText, "I DON'T KNOW") || this.contains(inputText, 'I DONT KNOW') || this.contains(inputText, 'NOT SURE') || this.contains(inputText, 'HELP ME UNDERSTAND') || this.contains(inputText, 'CAN YOU HELP') || this.contains(inputText, 'COULD YOU HELP');
    }

    declinesInfo(inputText) {
      return this.contains(inputText, 'NO THANKS') || this.contains(inputText, 'NOT NOW') || this.contains(inputText, 'RATHER NOT') || this.contains(inputText, 'NOPE');
    }

    countTech(tech) {
      if (this.contains(tech, 'REFLECTION')) this.reflectC += 1;
      if (this.contains(tech, 'OPEN_QUESTION')) {
        this.questionC += 1;
        this.openQC += 1;
      }
      if (this.contains(tech, 'CLOSED_QUESTION')) {
        this.questionC += 1;
        this.closedQC += 1;
      }
      if (this.contains(tech, 'AFFIRM')) this.affirmC += 1;
      if (this.contains(tech, 'SUMMARY')) this.summaryC += 1;
    }

    extractScale(inputText) {
      const checks = [
        ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9', 9],
        ['ZERO', 0], ['ONE', 1], ['TWO', 2], ['THREE', 3], ['FOUR', 4], ['FIVE', 5], ['SIX', 6], ['SEVEN', 7], ['EIGHT', 8], ['NINE', 9], ['TEN', 10],
        ['10 OUT OF 10', 10], ['1 OUT OF 10', 1], ['0 OUT OF 10', 0], ['10', 10], ['1', 1], ['0', 0]
      ];
      for (const [pat, value] of checks) {
        if (this.contains(inputText, pat)) return value;
      }
      return -1;
    }

    buildFinalAffirmation(baseAffirmation) {
      const actionText = this.cleanOneLine(this.lastStep);
      if (!actionText) return baseAffirmation;
      return `${baseAffirmation}\n\nYou agreed to take this action: ${this.addEndingPunctuation(actionText)}`;
    }

    addEndingPunctuation(textValue) {
      const tmp = this.cleanOneLine(textValue);
      if (!tmp) return tmp;
      return /[.!?]$/.test(tmp) ? tmp : `${tmp}.`;
    }

    cleanOneLine(textValue) {
      return String(textValue || '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    }

    contains(textValue, pat) {
      return String(textValue).indexOf(pat) >= 0;
    }

    padInt(value, width) {
      return String(value).padStart(width, ' ');
    }

    padNumber(value, width, decimals) {
      return Number(value).toFixed(decimals).padStart(width, ' ');
    }
  }

  const coach = new MICoach(workbook);

  const els = {
    startButton: document.getElementById('startButton'),
    resetButton: document.getElementById('resetButton'),
    chatWindow: document.getElementById('chatWindow'),
    chatForm: document.getElementById('chatForm'),
    userInput: document.getElementById('userInput'),
    sendButton: document.getElementById('sendButton'),
    metricsList: document.getElementById('metricsList'),
    scorecardOutput: document.getElementById('scorecardOutput'),
    downloadLog: document.getElementById('downloadLog'),
    downloadScorecard: document.getElementById('downloadScorecard'),
    sheetSelect: document.getElementById('sheetSelect'),
    worksheetTable: document.getElementById('worksheetTable')
  };

  function renderMessages() {
    els.chatWindow.innerHTML = '';
    if (!coach.messages.length) {
      const empty = document.createElement('div');
      empty.className = 'message meta';
      empty.textContent = 'Click “Start new session” to begin.';
      els.chatWindow.appendChild(empty);
      return;
    }
    for (const msg of coach.messages) {
      const div = document.createElement('div');
      div.className = `message ${msg.who === 'USER' ? 'user' : 'coach'}`;
      div.textContent = msg.text;
      els.chatWindow.appendChild(div);
    }
    if (coach.finished) {
      const done = document.createElement('div');
      done.className = 'message meta';
      done.textContent = 'SESSION COMPLETE. Download the session log and scorecard if required.';
      els.chatWindow.appendChild(done);
    }
    els.chatWindow.scrollTop = els.chatWindow.scrollHeight;
  }

  function renderMetrics() {
    const rows = [
      ['Stage', coach.stage],
      ['Change talk', coach.changeC],
      ['Sustain talk', coach.sustainC],
      ['Discord', coach.discordC],
      ['Neutral', coach.neutralC],
      ['Reflections', coach.reflectC],
      ['Questions', coach.questionC],
      ['Open questions', coach.openQC],
      ['Closed questions', coach.closedQC],
      ['Affirmations', coach.affirmC],
      ['Summaries', coach.summaryC],
      ['Ask-Tell-Ask', coach.ataC]
    ];
    els.metricsList.innerHTML = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      els.metricsList.appendChild(dt);
      els.metricsList.appendChild(dd);
    }
    els.scorecardOutput.textContent = coach.liveScorecardLines().join('\n');
  }

  function setInputEnabled(enabled) {
    els.userInput.disabled = !enabled;
    els.sendButton.disabled = !enabled;
    if (enabled) els.userInput.focus();
  }

  function startSession() {
    coach.start();
    renderMessages();
    renderMetrics();
    renderWorksheet();
    setInputEnabled(true);
  }

  function resetSession() {
    coach.resetState();
    renderMessages();
    renderMetrics();
    renderWorksheet();
    setInputEnabled(false);
  }

  function handleSend(event) {
    event.preventDefault();
    const text = els.userInput.value.trim();
    if (!text) return;
    coach.send(text);
    els.userInput.value = '';
    renderMessages();
    renderMetrics();
    renderWorksheet();
    setInputEnabled(coach.active && !coach.finished);
  }

  function downloadText(filename, lines) {
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function populateSheetSelect() {
    els.sheetSelect.innerHTML = '';
    for (const sheet of workbook.sheets) {
      const opt = document.createElement('option');
      opt.value = sheet.name;
      opt.textContent = sheet.name;
      els.sheetSelect.appendChild(opt);
    }
  }

  function rowsForSheet(sheetName) {
    if (sheetName === 'session_log.txt' && coach.sessionLog.length) return coach.sessionLog.map(x => [x]);
    if (sheetName === 'scorecard.txt' && coach.liveScorecardLines().length) return coach.liveScorecardLines().map(x => [x]);
    const sheet = workbook.sheets.find(s => s.name === sheetName);
    return sheet ? sheet.rows : [];
  }

  function columnLabel(index) {
    let label = '';
    let n = index + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      label = String.fromCharCode(65 + rem) + label;
      n = Math.floor((n - 1) / 26);
    }
    return label;
  }

  function renderWorksheet() {
    const sheetName = els.sheetSelect.value || (workbook.sheets[0] && workbook.sheets[0].name) || '';
    const rows = rowsForSheet(sheetName);
    if (!sheetName) {
      els.worksheetTable.textContent = 'No worksheet data available.';
      return;
    }
    const maxCols = Math.max(1, ...rows.map(r => r.length));
    const table = document.createElement('table');
    table.className = 'sheet-table';
    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    const corner = document.createElement('th');
    corner.textContent = '#';
    header.appendChild(corner);
    for (let c = 0; c < maxCols; c += 1) {
      const th = document.createElement('th');
      th.textContent = columnLabel(c);
      header.appendChild(th);
    }
    thead.appendChild(header);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    if (!rows.length) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.className = 'row-header';
      th.textContent = '1';
      const td = document.createElement('td');
      td.colSpan = maxCols;
      td.textContent = 'This worksheet is currently empty.';
      tr.appendChild(th);
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      rows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.className = 'row-header';
        th.textContent = String(idx + 1);
        tr.appendChild(th);
        for (let c = 0; c < maxCols; c += 1) {
          const td = document.createElement('td');
          td.textContent = row[c] == null ? '' : String(row[c]);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      });
    }
    table.appendChild(tbody);
    els.worksheetTable.innerHTML = '';
    els.worksheetTable.appendChild(table);
  }

  function bindNavigation() {
    const buttons = Array.from(document.querySelectorAll('.nav-button'));
    const panels = Array.from(document.querySelectorAll('.panel'));
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        const target = button.dataset.section;
        buttons.forEach(b => b.classList.toggle('active', b === button));
        panels.forEach(p => p.classList.toggle('active', p.id === target));
      });
    });
  }

  function init() {
    bindNavigation();
    populateSheetSelect();
    els.startButton.addEventListener('click', startSession);
    els.resetButton.addEventListener('click', resetSession);
    els.chatForm.addEventListener('submit', handleSend);
    els.sheetSelect.addEventListener('change', renderWorksheet);
    els.downloadLog.addEventListener('click', () => downloadText('session_log.txt', coach.sessionLog.length ? coach.sessionLog : ['No session log has been generated.']));
    els.downloadScorecard.addEventListener('click', () => downloadText('scorecard.txt', coach.liveScorecardLines()));
    renderMessages();
    renderMetrics();
    renderWorksheet();
  }

  document.addEventListener('DOMContentLoaded', init);
}());
