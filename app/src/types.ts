export interface Q { id: string; t: number; d: 'e' | 'm' | 'h'; q: string; o: string[]; a: number; e: string; p?: string; n?: 1 }
export interface SubjectData { id: string; name: string; topics: string[]; questions: Q[] }
export interface SubjectMeta { id: string; name: string; count: number; topics: { name: string; count: number }[]; compulsory?: boolean }
export interface ExamSubject { sid: string; qids: string[] }
export interface Exam {
  id: string; mode: 'full' | 'quick'; startedAt: number; duration: number; // ms
  subjects: ExamSubject[]; answers: Record<string, number>; // key `${sid}:${qid}` -> option index
  cur: { s: number; i: number }; submittedAt?: number;
  challenge?: { from: string; correct: number; total: number };
}
export interface SubjectResult { sid: string; correct: number; total: number; score: number }
export interface MockRecord { id: string; date: number; mode: 'full' | 'quick'; timeUsed: number; total: number; per: SubjectResult[]; exam: Exam }
export interface TopicStat { c: number; n: number }
export interface Progress {
  history: MockRecord[];
  topics: Record<string, TopicStat>; // `${sid}:${topicIdx}`
  days: string[]; // YYYY-MM-DD with activity
  seen: Record<string, number>; // `${sid}:${qid}` -> times seen
  pidgin: boolean;
  practiced: number; practiceCorrect: number;
  name?: string;
  /** `${sid}:${qid}` -> ms timestamp. Positive = saved/currently wrong, negative = removed/cleared at |ts| (last write wins across phones). */
  bm: Record<string, number>;
  wrong: Record<string, number>;
  /** YYYY-MM-DD -> questions answered that day (daily goal) */
  daily: Record<string, number>;
  goal: number;
}
