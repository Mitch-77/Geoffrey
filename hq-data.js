// =============================================================
// Headquarters data layer — foundation for the productivity-system
// upgrade (see PLAN.md). Not wired into any page yet.
//
// This repo has no relational database: "tasks" (called goals) live
// in localStorage as JSON, synced wholesale to a single Supabase
// blob table via sync.js. So instead of a SQL migration, the new
// entities below are localStorage collections under an "hq:" key
// prefix, synced the same way goals already are.
// =============================================================
(function () {
  'use strict';

  function uid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function storeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (e) { return fallback; }
  }
  function storeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  // ---------- Buckets ----------
  const BUCKETS_KEY = 'hq:buckets';
  const DEFAULT_BUCKETS = [
    { id: 'study',         name: 'Study',         color: '#5b8def' },
    { id: 'business',      name: 'Business',      color: '#d98c3e' },
    { id: 'fitness',       name: 'Fitness',       color: '#3ecf8e' },
    { id: 'faith',         name: 'Faith',         color: '#a06ce0' },
    { id: 'admin',         name: 'Admin',         color: '#8a8f98' },
    { id: 'relationships', name: 'Relationships', color: '#e05c8a' },
  ];
  function getBuckets() {
    const existing = storeGet(BUCKETS_KEY, null);
    if (existing && existing.length) return existing;
    storeSet(BUCKETS_KEY, DEFAULT_BUCKETS);
    return DEFAULT_BUCKETS.slice();
  }
  function setBuckets(list) { storeSet(BUCKETS_KEY, list); }
  function addBucket(name, color) {
    const list = getBuckets();
    const bucket = { id: uid(), name, color: color || '#8a8f98' };
    list.push(bucket);
    setBuckets(list);
    return bucket;
  }

  // ---------- Projects ----------
  const PROJECTS_KEY = 'hq:projects';
  function getProjects() { return storeGet(PROJECTS_KEY, []); }
  function setProjects(list) { storeSet(PROJECTS_KEY, list); }
  function addProject({ name, bucket, status, deadline }) {
    const list = getProjects();
    const project = {
      id: uid(),
      name,
      bucket: bucket || null,
      status: status || 'ongoing', // 'ongoing' | 'deadline' | 'done'
      deadline: deadline || null,
      createdAt: new Date().toISOString(),
    };
    list.push(project);
    setProjects(list);
    return project;
  }
  function updateProject(id, patch) {
    const list = getProjects();
    const idx = list.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    list[idx] = Object.assign({}, list[idx], patch);
    setProjects(list);
    return list[idx];
  }
  function deleteProject(id, opts) {
    const deleteLinkedItems = !!(opts && opts.deleteLinkedItems);
    setProjects(getProjects().filter((p) => p.id !== id));
    // Bottlenecks only make sense in the context of their project (no
    // general "bottlenecks" list to fall back to) — always remove them.
    setBottlenecks(getBottlenecks().filter((b) => b.projectId !== id));
    // Notes: either drop them or just unlink, per the caller's choice.
    // Linked tasks live under goals: keys, outside this module's data —
    // the caller (main.html) handles those the same way.
    if (deleteLinkedItems) {
      setNotes(getNotes().filter((n) => n.projectId !== id));
    } else {
      setNotes(getNotes().map((n) => n.projectId === id ? Object.assign({}, n, { projectId: null }) : n));
    }
  }

  // ---------- Notes ----------
  const NOTES_KEY = 'hq:notes';
  function getNotes() { return storeGet(NOTES_KEY, []); }
  function setNotes(list) { storeSet(NOTES_KEY, list); }
  function addNote({ content, bucket, projectId, taskId, topic }) {
    const list = getNotes();
    const note = {
      id: uid(),
      content,
      bucket: bucket || null,
      projectId: projectId || null,
      taskId: taskId || null,
      topic: topic || null,
      createdAt: new Date().toISOString(),
    };
    list.push(note);
    setNotes(list);
    return note;
  }

  // ---------- Journal entries ----------
  const JOURNAL_KEY = 'hq:journal';
  function getJournalEntries() { return storeGet(JOURNAL_KEY, []); }
  function setJournalEntries(list) { storeSet(JOURNAL_KEY, list); }
  function addJournalEntry({ type, content, weekStart }) {
    const list = getJournalEntries();
    const entry = {
      id: uid(),
      type, // 'daily' | 'weekly' | 'monthly'
      content,
      weekStart: weekStart || null,
      createdAt: new Date().toISOString(),
    };
    list.push(entry);
    setJournalEntries(list);
    return entry;
  }

  // ---------- Bottlenecks ----------
  const BOTTLENECKS_KEY = 'hq:bottlenecks';
  function getBottlenecks() { return storeGet(BOTTLENECKS_KEY, []); }
  function setBottlenecks(list) { storeSet(BOTTLENECKS_KEY, list); }
  function addBottleneck({ projectId, problem, fix }) {
    const list = getBottlenecks();
    const bottleneck = {
      id: uid(),
      projectId: projectId || null,
      problem,
      fix: fix || null,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    list.push(bottleneck);
    setBottlenecks(list);
    return bottleneck;
  }
  function resolveBottleneck(id) {
    const list = getBottlenecks();
    const idx = list.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    list[idx].resolved = true;
    setBottlenecks(list);
    return list[idx];
  }

  // ---------- Goal (task) field normalization ----------
  // Existing goals are plain {text, done}. This fills in the new
  // Headquarters fields with defaults without touching text/done,
  // and assigns a stable id if one is missing.
  function normalizeGoal(goal) {
    if (!goal.id) goal.id = uid();
    if (!goal.importance) goal.importance = 'not_important'; // 'important' | 'not_important' | 'move_the_needle'
    if (!goal.urgency) goal.urgency = 'not_urgent';           // 'urgent' | 'not_urgent' | 'habit'
    if (goal.state === undefined) goal.state = null;          // 'flow' | 'quick' | 'easy' | 'personal' | null
    if (goal.bucket === undefined) goal.bucket = null;
    if (goal.projectId === undefined) goal.projectId = null;
    if (goal.minutes === undefined) goal.minutes = null;
    if (goal.startTime === undefined) goal.startTime = null;
    if (goal.durationMinutes === undefined) goal.durationMinutes = null;
    if (goal.missedDays === undefined) goal.missedDays = 0;
    return goal;
  }

  // Eisenhower rank: lower = higher priority. Habits always sort last.
  function eisenhowerRank(goal) {
    if (goal.urgency === 'habit') return 4;
    const important = goal.importance === 'important' || goal.importance === 'move_the_needle';
    const urgent = goal.urgency === 'urgent';
    if (important && urgent) return 0;
    if (!important && urgent) return 1;
    if (important && !urgent) return 2;
    return 3;
  }

  // ---------- Completed-task archive ----------
  // main.html's rollover() deletes each day's whole goal list once it's no
  // longer "today" - completed tasks would vanish along with it with no
  // history at all. rollover() calls archiveCompletedTasks() first so Time
  // Tracking / Move the Needle / Weekly Review have something to read.
  const COMPLETED_LOG_KEY = 'hq:completedLog';
  const COMPLETED_LOG_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000; // ~13 months
  function getCompletedLog() { return storeGet(COMPLETED_LOG_KEY, []); }
  function setCompletedLog(list) { storeSet(COMPLETED_LOG_KEY, list); }
  function archiveCompletedTasks(dateStr, doneGoals) {
    if (!doneGoals || !doneGoals.length) return;
    const log = getCompletedLog();
    doneGoals.forEach((g) => {
      log.push({
        id: g.id || uid(),
        text: g.text,
        bucket: g.bucket || null,
        projectId: g.projectId || null,
        importance: g.importance || 'not_important',
        urgency: g.urgency || 'not_urgent',
        minutes: g.minutes || null,
        date: dateStr,
        doneAt: g.doneAt || null,
      });
    });
    const cutoff = Date.now() - COMPLETED_LOG_MAX_AGE_MS;
    setCompletedLog(log.filter((e) => !e.doneAt || e.doneAt >= cutoff));
  }

  // ---------- Daily recurring task templates ----------
  // A template is matched to a today-list goal by exact text. Kept separate
  // from the goal objects themselves since goals get recreated each day.
  const DAILY_TEMPLATES_KEY = 'hq:dailyTemplates';
  function getDailyTemplates() { return storeGet(DAILY_TEMPLATES_KEY, []); }
  function setDailyTemplates(list) { storeSet(DAILY_TEMPLATES_KEY, list); }
  function isDailyTemplate(text) {
    return getDailyTemplates().some((t) => t.text === text);
  }
  function addDailyTemplate({ text, bucket, projectId }) {
    const list = getDailyTemplates();
    if (list.some((t) => t.text === text)) return;
    list.push({ text, bucket: bucket || null, projectId: projectId || null });
    setDailyTemplates(list);
  }
  function removeDailyTemplate(text) {
    setDailyTemplates(getDailyTemplates().filter((t) => t.text !== text));
  }

  // ---------- Active bucket filter (workspace filtering) ----------
  const ACTIVE_BUCKET_KEY = 'hq:activeBucket';
  function getActiveBucket() { return storeGet(ACTIVE_BUCKET_KEY, null); } // null = "All"
  function setActiveBucket(id) {
    storeSet(ACTIVE_BUCKET_KEY, id || null);
    window.dispatchEvent(new CustomEvent('hq-bucket-changed'));
  }

  // ---------- Cloud sync registration ----------
  // Separate from the existing 'goals' sync so it doesn't disturb it.
  function initSync() {
    if (typeof window.initCloudSync !== 'function') return;
    window.initCloudSync({
      appKey: 'hq-data',
      syncedPrefixes: ['hq:'],
      onApplied: function () {
        window.dispatchEvent(new CustomEvent('hq-data-changed'));
      },
    });
  }

  window.HQ = {
    uid,
    getBuckets, setBuckets, addBucket,
    getProjects, setProjects, addProject, updateProject, deleteProject,
    getNotes, setNotes, addNote,
    getJournalEntries, setJournalEntries, addJournalEntry,
    getBottlenecks, setBottlenecks, addBottleneck, resolveBottleneck,
    normalizeGoal, eisenhowerRank,
    getActiveBucket, setActiveBucket,
    getDailyTemplates, setDailyTemplates, isDailyTemplate, addDailyTemplate, removeDailyTemplate,
    getCompletedLog, setCompletedLog, archiveCompletedTasks,
    initSync,
  };
})();
