type RotationFamily = { id: string; lastPrayedByMemberId: string | null };
type RotationMember = { id: string; capacity: number };

/** Families arrive in prayer priority order and members in stable join order. */
export function assignFamilies(families: RotationFamily[], members: RotationMember[]): Record<string, string> {
  const loads = members.map((member) => ({ ...member, load: 0 }));
  const assignments: Record<string, string> = {};
  const repeats: string[] = [];

  for (const family of families) {
    const available = loads.filter((member) => member.load < member.capacity);
    const [chosen] = available.sort((a, b) => {
      const repeatPreference = Number(a.id === family.lastPrayedByMemberId) - Number(b.id === family.lastPrayedByMemberId);
      return repeatPreference || a.load - b.load || b.capacity - a.capacity;
    });
    if (!chosen) {
      assignments[family.id] = "skip";
      continue;
    }
    assignments[family.id] = chosen.id;
    chosen.load++;
    if (chosen.id === family.lastPrayedByMemberId) repeats.push(family.id);
  }

  if (!repeats.length) return assignments;

  // A repeat can only start once a single member has slots left, so every repeat
  // belongs to that member. Swap with families another member can hand back.
  const lastMember = assignments[repeats[0]];
  let repaired = 0;
  for (const family of families) {
    const other = assignments[family.id];
    if (other === "skip" || other === lastMember || family.lastPrayedByMemberId === lastMember) continue;
    assignments[repeats[repaired]] = other;
    assignments[family.id] = lastMember;
    repaired++;
    if (repaired === repeats.length) break;
  }
  // Any remaining repeat is necessary: every slot outside lastMember now
  // serves a family whose previous assignee was lastMember.
  return assignments;
}
