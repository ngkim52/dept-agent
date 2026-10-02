// 토론방(Debate Room) 공용 타입 (019)
export type DebateStatus = "draft" | "running" | "finished" | "stopped" | "failed";
export type DebatePersonaKind = "member" | "observer" | "conclusion";
export type DebateMessageKind = DebatePersonaKind | "system";

export type DebatePersona = {
  key: string;
  name: string;
  emoji: string;
  role: string;        // 직함/소속
  stance: string;      // 기본 입장(관점) 한 줄
  expertise: string;   // 근거로 삼는 전문 영역
  goal: string;        // 토론에서 얻으려는 것
  redLine: string;     // 양보할 수 없는 선
  tone: string;        // 말투
  color: string;
  kind: DebatePersonaKind;
  builtin: boolean;
  overridden?: boolean; // 빌트인 페르소나를 수정했는지
  note: string;         // 추가 지침(선택)
  systemPrompt: string; // 위 필드들로 조립된 최종 프롬프트
};

export type DebateParticipant = {
  key: string;
  name: string;
  emoji: string;
  color: string;
  role: string;
  kind: DebatePersonaKind;
};

/** 발언에 실리는 감정 상태 */
export type DebateEmotion = "기대" | "만족" | "중립" | "우려" | "불만" | "단호";
/** 안건에 대한 입장 */
export type DebateStance = "찬성" | "조건부" | "반대" | "유보";

export type DebateMessage = {
  id: string;
  sessionId: string;
  seq: number;
  personaKey: string;
  personaName: string;
  personaEmoji: string;
  personaColor: string;
  kind: DebateMessageKind;
  round: number;
  content: string;
  /** 감정(없으면 "") */
  emotion: DebateEmotion | "";
  /** 안건 수용도 0~100 (없으면 null) */
  satisfaction: number | null;
  /** 입장(없으면 "") */
  stance: DebateStance | "";
  /** 발언에 드러내지 않은 속마음 */
  innerThought: string;
  createdAt: string;
};

export type DebateSession = {
  id: string;
  title: string;
  brief: string;
  attachmentName: string | null;
  status: DebateStatus;
  durationSec: number;
  participantKeys: string[];
  participants: DebateParticipant[];
  round: number;
  turnCount: number;
  maxTurns: number;
  verdict: string | null;
  reportPath: string | null;
  hasReport: boolean;
  createdBy: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DebateSynthesis = {
  verdict: string;
  summary: string;
  /** 라운드별 흐름 (결정적 생성) */
  roundFlow: { round: number; label: string; gist: string }[];
  agreements: string[];
  /** 조건부 합의 — "~하면 동의" 형태 */
  conditions: string[];
  disputes: { issue: string; pro: string; con: string }[];
  risks: string[];
  actions: { what: string; owner: string; due: string }[];
  positions: { persona: string; stance: string; keyPoint: string }[];
  openQuestions: string[];
  decisionBasis: string[];
};
