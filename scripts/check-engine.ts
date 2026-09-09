import assert from "node:assert/strict";
import {
  mergeIntervals,
  complement,
  intersectPair,
  intersectAll,
  weekDates,
  busyFromCourses,
  commonFree,
} from "../lib/overlap";
import {
  fetchTermSections,
  indexByClassNumber,
  parseScheduleInput,
  formatTime,
  toMinutes,
} from "../lib/sfu";

// --- pure interval math -----------------------------------------------------
assert.deepEqual(
  mergeIntervals([{ start: 60, end: 90 }, { start: 80, end: 100 }, { start: 100, end: 110 }]),
  [{ start: 60, end: 110 }],
  "touching + overlapping intervals collapse"
);
assert.deepEqual(
  complement([{ start: 600, end: 660 }], { start: 480, end: 720 }),
  [{ start: 480, end: 600 }, { start: 660, end: 720 }],
  "complement splits around a class"
);
assert.deepEqual(complement([], { start: 480, end: 720 }), [{ start: 480, end: 720 }]);
assert.deepEqual(
  complement([{ start: 400, end: 800 }], { start: 480, end: 720 }),
  [],
  "fully covered day yields nothing"
);
assert.deepEqual(
  intersectPair([{ start: 0, end: 100 }, { start: 200, end: 300 }], [{ start: 50, end: 250 }]),
  [{ start: 50, end: 100 }, { start: 200, end: 250 }],
  "intersection keeps both fragments"
);
assert.deepEqual(
  intersectAll([[{ start: 0, end: 100 }], [{ start: 40, end: 90 }], [{ start: 50, end: 200 }]]),
  [{ start: 50, end: 90 }]
);

// --- input parsing ----------------------------------------------------------
assert.deepEqual(
  parseScheduleInput("https://sfucourses.com/schedule?courses=5446-5447-6127&term=fall"),
  ["5446", "5447", "6127"],
  "class numbers pulled from a real share link"
);
assert.deepEqual(parseScheduleInput("5446, 5447 6127"), ["5446", "5447", "6127"]);
assert.deepEqual(parseScheduleInput("5446-5446"), ["5446"], "duplicates collapse");
assert.deepEqual(parseScheduleInput("https://sfucourses.com/schedule"), []);

// --- against the live API ---------------------------------------------------
const term = "2025-fall";
const courses = await fetchTermSections(term);
const index = indexByClassNumber(courses);
console.log(`term ${term}: ${courses.length} courses, ${index.size} sections`);

const dates = weekDates(new Date("2025-10-15T12:00:00"));
assert.equal(dates.Mo, "2025-10-13");
assert.equal(dates.Su, "2025-10-19");

// Pick three real in-person sections that actually meet, as three "friends".
const picks: string[] = [];
for (const [classNumber, { section }] of index) {
  const meets = section.schedules.some(
    (s) => s.days.trim() && s.campus.trim() === "Burnaby" && s.startDate <= dates.Mo && s.endDate >= dates.Fr
  );
  if (meets) picks.push(classNumber);
  if (picks.length === 3) break;
}
assert.equal(picks.length, 3, "found three sample sections");

const membersBusy = picks.map((cn) => busyFromCourses(index, [cn], dates));
membersBusy.forEach((busy, i) => {
  assert.ok(busy.length > 0, `member ${i} has busy blocks`);
  for (const b of busy) {
    assert.ok(b.end > b.start, "block has positive duration");
    assert.ok(b.start >= 0 && b.end <= 24 * 60, "block inside the day");
  }
});

const dayStart = toMinutes("08:00");
const dayEnd = toMinutes("22:00");
const free = commonFree({ membersBusy, dayStart, dayEnd, minMinutes: 60 });

// Every reported window must be free for every member — the property that matters.
for (const w of free) {
  assert.ok(w.end - w.start >= 60, "respects minMinutes");
  assert.ok(w.start >= dayStart && w.end <= dayEnd, "inside the search window");
  for (const busy of membersBusy) {
    for (const b of busy.filter((b) => b.day === w.day)) {
      assert.ok(b.end <= w.start || b.start >= w.end, `window ${w.day} ${formatTime(w.start)} collides with ${b.label}`);
    }
  }
}

// Meetups are weekday-only: weekend windows must never appear by default.
assert.ok(
  free.every((w) => w.day !== "Sa" && w.day !== "Su"),
  "no weekend windows in the default result"
);
// ...but an explicit days list is still honoured.
const weekend = commonFree({ membersBusy, dayStart, dayEnd, minMinutes: 60, days: ["Sa"] });
assert.ok(weekend.every((w) => w.day === "Sa"), "explicit days override still works");

// A member who is busy all week must drive the result to nothing.
const allBusy = [{ day: "Mo" as const, start: 0, end: 1440, campus: "Burnaby", label: "blocked", course: "blocked", detail: "" }];
const blocked = commonFree({
  membersBusy: [...membersBusy, allBusy],
  dayStart, dayEnd, minMinutes: 60, days: ["Mo"],
});
assert.equal(blocked.length, 0, "a fully-busy member removes every Monday window");

console.log(`sections used: ${picks.join(", ")}`);
console.log(`common free windows (>=60m): ${free.length}`);
for (const w of free.slice(0, 6)) {
  console.log(`  ${w.day} ${formatTime(w.start)}-${formatTime(w.end)} campuses=[${w.campuses}] shared=${w.sharedCampus}`);
}
console.log("ALL ENGINE CHECKS PASSED");
