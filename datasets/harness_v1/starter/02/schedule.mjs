export function findConflicts(appointments, requested) {
  const clock = value => value.slice(11, 16);
  return appointments
    .filter(entry => clock(entry.start) <= clock(requested.end) &&
      clock(entry.end) >= clock(requested.start))
    .map(entry => entry.id);
}
