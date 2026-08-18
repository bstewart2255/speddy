/**
 * A student's teacher set, read in the order their classes run.
 *
 * `student_teachers.period` is display-only free text (SPE-334) written by two
 * different hands — the SIS link sync copies whatever the roster carries
 * ("5 (1:30 PM - 2:25 PM)"), a provider types "3" or "Period 3" — so these
 * tests pin the reading rule against both shapes, and against the elementary
 * case (no periods at all), where the sort must be a no-op.
 */
import { sortTeachersByPeriod } from '@/lib/supabase/queries/student-teachers';

const link = (name: string, period: string | null) => ({ name, period });
const names = (rows: { name: string }[]) => rows.map(r => r.name);

describe('sortTeachersByPeriod', () => {
  it('reads the SIS labels as the student\'s school day', () => {
    // The set as production hands it over: link order, not day order.
    const sorted = sortTeachersByPeriod([
      link('Boltz', '5 (1:30 PM - 2:25 PM)'),
      link('Rigler', '3 (10:45 AM - 11:40 AM)'),
      link('Hanson', '4 (11:50 AM - 12:45 PM)'),
      link('Abdu', '2 (9:35 AM - 10:30 AM)'),
      link('Hayden', '1 (8:30 AM - 9:25 AM)'),
      link('McClure', '6 (2:35 PM - 3:30 PM)'),
    ]);
    expect(names(sorted)).toEqual([
      'Hayden', 'Abdu', 'Rigler', 'Hanson', 'Boltz', 'McClure',
    ]);
  });

  it('reads PM as the afternoon, not as a bigger morning', () => {
    // 1:30 PM sorts after 11:50 AM. On the raw numbers it would sort first.
    const sorted = sortTeachersByPeriod([
      link('afternoon', 'Study hall (1:30 PM - 2:25 PM)'),
      link('late morning', 'Lunch (11:50 AM - 12:45 PM)'),
    ]);
    expect(names(sorted)).toEqual(['late morning', 'afternoon']);
  });

  it('puts noon after the morning and midnight before it', () => {
    const sorted = sortTeachersByPeriod([
      link('noon', '(12:15 PM)'),
      link('midnight', '(12:15 AM)'),
      link('morning', '(8:30 AM)'),
    ]);
    expect(names(sorted)).toEqual(['midnight', 'morning', 'noon']);
  });

  it('reads a label with no meridiem as a 24-hour clock', () => {
    const sorted = sortTeachersByPeriod([
      link('afternoon', 'Study hall (13:30 - 14:25)'),
      link('morning', 'Advisory (08:30 - 09:25)'),
    ]);
    expect(names(sorted)).toEqual(['morning', 'afternoon']);
  });

  it('orders a hand-typed label by its number, not as a string', () => {
    // "10" must land after "9"; a string sort puts it right after "1".
    const sorted = sortTeachersByPeriod([
      link('ten', '10'),
      link('two', 'Period 2'),
      link('nine', '9'),
    ]);
    expect(names(sorted)).toEqual(['two', 'nine', 'ten']);
  });

  it('interleaves a hand-typed period with the SIS labels around it', () => {
    // The normal state of a synced roster somebody has since edited: the
    // hand-typed "2" belongs between first and third period, not below sixth.
    const sorted = sortTeachersByPeriod([
      link('first', '1 (8:30 AM - 9:25 AM)'),
      link('third', '3 (10:45 AM - 11:40 AM)'),
      link('sixth', '6 (2:35 PM - 3:30 PM)'),
      link('hand-typed second', '2'),
    ]);
    expect(names(sorted)).toEqual(['first', 'hand-typed second', 'third', 'sixth']);
  });

  it('does not read the hour of an unnumbered class as its period', () => {
    // "Advisory (7:30 AM…)" is not period 7 — it has no number at all, so it
    // sorts below the numbered classes rather than between 6 and 8.
    const sorted = sortTeachersByPeriod([
      link('advisory', 'Advisory (7:30 AM - 8:20 AM)'),
      link('eighth', '8 (3:40 PM - 4:35 PM)'),
      link('sixth', '6 (2:35 PM - 3:30 PM)'),
    ]);
    expect(names(sorted)).toEqual(['sixth', 'eighth', 'advisory']);
  });

  it('orders the unnumbered classes among themselves by time', () => {
    const sorted = sortTeachersByPeriod([
      link('lunch', 'Lunch (11:45 AM - 12:20 PM)'),
      link('advisory', 'Advisory (7:30 AM - 8:20 AM)'),
      link('first', '1 (8:30 AM - 9:25 AM)'),
    ]);
    expect(names(sorted)).toEqual(['first', 'advisory', 'lunch']);
  });

  it('sinks the unlabeled rows to the bottom, in the order they arrived', () => {
    const sorted = sortTeachersByPeriod([
      link('blank', '   '),
      link('none', null),
      link('second', '2 (9:35 AM - 10:30 AM)'),
    ]);
    expect(names(sorted)).toEqual(['second', 'blank', 'none']);
  });

  it('leaves an elementary set exactly as it was', () => {
    // No link carries a period, so every row ties and nothing moves — the
    // co-teacher pair still reads the way the caller handed it over.
    const set = [link('Davis', null), link('Winbery', null)];
    expect(names(sortTeachersByPeriod(set))).toEqual(['Davis', 'Winbery']);
  });

  it('does not reorder the caller\'s own array', () => {
    // Link order still means something to the callers that hold it: the
    // legacy `students.teacher_id` mirror's "first listed", and the one
    // gen-ed teacher an IEP meeting is assembled around.
    const set = [link('later', '6 (2:35 PM)'), link('earlier', '1 (8:30 AM)')];
    sortTeachersByPeriod(set);
    expect(names(set)).toEqual(['later', 'earlier']);
  });

  it('keeps a same-period pair in the order it arrived', () => {
    // Two teachers really do share a period at a co-taught secondary class.
    const sorted = sortTeachersByPeriod([
      link('co-teacher', '2 (9:35 AM - 10:30 AM)'),
      link('teacher', '2 (9:35 AM - 10:30 AM)'),
      link('first', '1 (8:30 AM - 9:25 AM)'),
    ]);
    expect(names(sorted)).toEqual(['first', 'co-teacher', 'teacher']);
  });

  it('orders a multi-period label by its earliest class', () => {
    // The link sync joins a teacher's periods with "/" when a student sits in
    // more than one of their classes. Written here worst-first, so passing
    // means the smallest match placed the row, not the leading one.
    const sorted = sortTeachersByPeriod([
      link('third', '3 (10:45 AM - 11:40 AM)'),
      link('fifth and first', '5 (1:30 PM - 2:25 PM)/1 (8:30 AM - 9:25 AM)'),
    ]);
    expect(names(sorted)).toEqual(['fifth and first', 'third']);
  });

  it('places a hand-typed label by its period, not by a room after it', () => {
    const sorted = sortTeachersByPeriod([
      link('fifth in room 2', '5 - Rm 2'),
      link('third', '3'),
    ]);
    expect(names(sorted)).toEqual(['third', 'fifth in room 2']);
  });

  it('ignores a time that is not one, rather than placing the row by it', () => {
    // Room "99:99" is not 99 past 99 o'clock; the period number still places
    // the row, and a label with neither goes to the bottom.
    const sorted = sortTeachersByPeriod([
      link('nonsense', 'Room 99:99'),
      link('second', 'Period 2'),
      link('lettered', 'Block A'),
    ]);
    expect(names(sorted)).toEqual(['second', 'nonsense', 'lettered']);
  });

  it('is a total order — the result does not depend on the input order', () => {
    const set = [
      link('a', '1 (8:30 AM)'),
      link('b', '3'),
      link('c', 'Advisory (7:30 AM)'),
      link('d', null),
      link('e', '2 (9:35 AM)'),
    ];
    const forwards = names(sortTeachersByPeriod(set));
    const backwards = names(sortTeachersByPeriod([...set].reverse()));
    expect(backwards).toEqual(forwards);
  });
});
