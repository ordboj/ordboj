import type { Form } from '@/lib/verbs';

// One place where an SRS item id is built.
//
// The id is the primary key of a learner's progress in localStorage, and it
// is irreplaceable data: a mismatch between the string one file writes and
// the string another file reads does not throw, it just silently returns
// "no progress" and starts the item over. Before this helper the same
// template literal was written out in five files, so keeping them in step
// depended on nobody ever editing one of them alone.
//
// The format is `<verbId>-<form>` and it is frozen: `verbId` is
// `String(index + 1)` over VERB_DATA (see src/lib/verbs.ts and the order pin
// test in src/data/verbData.orderPin.test.ts). Changing the shape here
// orphans every stored key and needs a storage migration, not an edit.
export function conjugationItemId(verbId: string, form: Form): string {
  return `${verbId}-${form}`;
}
