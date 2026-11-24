// 「今日」画面の判定ロジック（画面に依存しない純粋な関数）。ブラウザは window.TodayLogic、Node は module.exports で使う
(function (root) {
  'use strict';

  // YYYY-MM-DD の形で、実在する日付か
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }
  const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

  // 端末のローカル日付（YYYY-MM-DD）
  function todayISO(now) {
    const p = (n) => String(n).padStart(2, '0');
    return now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
  }

  // 見出し用（例: 11月25日（水））
  function formatHeading(now) {
    return (now.getMonth() + 1) + '月' + now.getDate() + '日（' + '日月火水木金土'[now.getDay()] + '）';
  }

  // グループの色は ToDo の8色（これ以外・なしは gray）
  const GROUP_COLORS = ['amber', 'green', 'blue', 'red', 'purple', 'pink', 'teal', 'gray'];
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  // ToDo の保存データ { items, statuses, groups } から、今日の分と期限切れを取り出す
  // ToDo 本体（todo.html の isOverdue・繰り越し処理）と同じ判定にそろえる
  function pickTodo(value, today) {
    const out = { overdue: [], today: [] };
    if (value == null) return out;
    // 本番の app_kv.value は text（JSON文字列）なので、文字列なら読み解く
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (e) { throw new Error('形式が違います'); }
      if (value == null) return out;
    }
    if (typeof value !== 'object' || !Array.isArray(value.items)) throw new Error('形式が違います');
    const statuses = Array.isArray(value.statuses) ? value.statuses : [];
    const groups = Array.isArray(value.groups) ? value.groups : [];
    const stOf = (id) => statuses.find((s) => s && s.id === id);
    const grOf = (id) => groups.find((x) => x && x.id === id);
    const grName = (id) => { const g = grOf(id); return g && typeof g.name === 'string' ? g.name : ''; };
    const grColor = (id) => { const g = grOf(id); return g && GROUP_COLORS.indexOf(g.color) >= 0 ? g.color : 'gray'; };

    const rows = [];
    value.items.forEach((it, idx) => {
      if (!it || typeof it !== 'object' || Array.isArray(it)) return;
      if (it.archived || it.deleted) return;
      if (!isDate(it.date)) return;
      const st = stOf(it.status);
      if (st && st.done) return;
      const until = isDate(it.until) && it.until > it.date ? it.until : '';
      const end = until || it.date;
      let kind;
      if (it.roll === true && it.date <= today) kind = 'today'; // 繰り越しは、古い日付でも今日の分
      else if (it.date <= today && end >= today) kind = 'today';
      else if (end < today) kind = 'overdue';
      else return; // 明日以降
      rows.push({
        kind, idx,
        ord: typeof it.ord === 'number' && isFinite(it.ord) ? it.ord : Infinity,
        top: !!statuses.length && !!statuses[0] && it.status === statuses[0].id, // 状態の一番上（要）
        created: typeof it.createdAt === 'string' ? it.createdAt : '',
        row: {
          id: String(it.id == null ? '' : it.id),
          text: String(it.text == null ? '' : it.text).trim() || '（無題）',
          date: it.date,
          time: isTime(it.time) ? it.time : '',
          until,
          groupName: typeof it.group === 'string' ? grName(it.group) : '',
          groupColor: typeof it.group === 'string' ? grColor(it.group) : 'gray',
          statusName: st && typeof st.name === 'string' ? st.name : ''
        }
      });
    });

    // 同じ日の中の並びは ToDo 本体（todo.html の byTime）にそろえる: 手動の並び(ord)→状態の先頭→時刻あり(早い順)→登録順
    const byTime = (a, b) =>
      (a.ord === b.ord ? 0 : a.ord < b.ord ? -1 : 1)
      || (Number(!a.top) - Number(!b.top))
      || (Number(!a.row.time) - Number(!b.row.time))
      || cmp(a.row.time, b.row.time)
      || cmp(a.created, b.created)
      || a.idx - b.idx;
    rows.filter((r) => r.kind === 'overdue')
      .sort((a, b) => cmp(b.row.date, a.row.date) || byTime(a, b)) // 期限切れは新しい日付が上
      .forEach((r) => out.overdue.push(r.row));
    rows.filter((r) => r.kind === 'today')
      .sort(byTime)
      .forEach((r) => out.today.push(r.row));
    return out;
  }

  const api = { isDate, todayISO, formatHeading, pickTodo };
  root.TodayLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
