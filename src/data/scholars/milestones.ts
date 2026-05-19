import type { AmbitionId, FearId } from '../../models/Scholar';

export const AMBITION_TEXT: Record<AmbitionId, string> = {
  civilization_changing_work: 'to produce a work that changes civilization',
  found_school_of_thought:    'to found a school of thought',
  student_surpasses_them:     'to have a student surpass them',
  remembered_after_death:     'to be remembered after death',
};

export const FEAR_TEXT: Record<FearId, string> = {
  forgotten:                'being forgotten',
  outshone_by_assistant:    'being outshone by someone they trained',
  never_finish_great_work:  'never completing their life\'s great work',
  discipline_irrelevant:    'losing their discipline to irrelevance',
};

export const AMBITION_IDS: AmbitionId[] = Object.keys(AMBITION_TEXT) as AmbitionId[];
export const FEAR_IDS: FearId[]         = Object.keys(FEAR_TEXT) as FearId[];

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
