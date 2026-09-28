import { relations } from "drizzle-orm";
import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  personaKey: text("persona_key").notNull(),
  ragflowDatasetId: text("ragflow_dataset_id"), // 부서 ↔ RAGFlow 데이터셋 링크
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const departmentDatasets = sqliteTable("department_datasets", {
  departmentId: text("department_id").notNull().references(() => departments.id),
  datasetId: text("dataset_id").notNull(),
  datasetName: text("dataset_name"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.departmentId, t.datasetId] }),
  deptIdx: index("department_datasets_dept_idx").on(t.departmentId),
}));

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON 문자열 저장
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  status: text("status", { enum: ["pending", "active", "rejected"] })
    .notNull()
    .default("pending"),
  departmentId: text("department_id").references(() => departments.id),
  responseStyle: text("response_style", { enum: ["coaching", "conclusion"] })
    .notNull()
    .default("coaching"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  userIdx: index("sessions_user_idx").on(t.userId),
  expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
}));

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  departmentId: text("department_id").references(() => departments.id),
  categoryKey: text("category_key"),
  categoryLabel: text("category_label"),
  title: text("title"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  userIdx: index("conversations_user_idx").on(t.userId),
}));

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  citations: text("citations"), // JSON 문자열 (참조 근거)
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  convIdx: index("messages_conversation_idx").on(t.conversationId),
}));

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id), // 소유자
  departmentId: text("department_id").references(() => departments.id), // (선택) 부서 연계, 사용자별 관리는 userId 기준
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  content: text("content"), // 업로드 파일 본문 (텍스트 계열; 사용자별 개인 자료, "@" 지정 시 LLM 컨텍스트로 주입)
  ragflowDocId: text("ragflow_doc_id"),
  status: text("status", { enum: ["uploaded", "parsing", "done", "failed"] })
    .notNull()
    .default("done"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  userIdx: index("documents_user_idx").on(t.userId),
}));

// ===== 지식 하네스 (자기개선 지식 저장소, Phase 1) =====
export const knowledgePrompts = sqliteTable("knowledge_prompts", {
  id: text("id").primaryKey(),
  personaKey: text("persona_key").notNull(),
  kind: text("kind", { enum: ["addendum", "rule", "role", "correction"] }).notNull().default("addendum"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  origin: text("origin", { enum: ["manual", "auto", "review", "base_copied"] }).notNull().default("manual"),
  confidence: real("confidence").notNull().default(1),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  orderIdx: integer("order_idx").notNull().default(0),
  hitCount: integer("hit_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  personaIdx: index("knowledge_prompts_persona_idx").on(t.personaKey),
}));

export const knowledgeSkills = sqliteTable("knowledge_skills", {
  id: text("id").primaryKey(),
  personaKey: text("persona_key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  content: text("content").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  origin: text("origin", { enum: ["manual", "auto", "review", "base_copied"] }).notNull().default("manual"),
  confidence: real("confidence").notNull().default(1),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  orderIdx: integer("order_idx").notNull().default(0),
  hitCount: integer("hit_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  personaIdx: index("knowledge_skills_persona_idx").on(t.personaKey),
}));

export const knowledgeMemories = sqliteTable("knowledge_memories", {
  id: text("id").primaryKey(),
  personaKey: text("persona_key").notNull(),
  kind: text("kind", { enum: ["fact", "preference", "decision", "lesson", "precedent"] }).notNull().default("fact"),
  content: text("content").notNull(),
  tags: text("tags"), // JSON 배열 문자열
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  origin: text("origin", { enum: ["manual", "auto", "review", "base_copied"] }).notNull().default("manual"),
  confidence: real("confidence").notNull().default(1),
  hitCount: integer("hit_count").notNull().default(0),
  sourceConversationId: text("source_conversation_id"),
  sourceMessageId: text("source_message_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  personaIdx: index("knowledge_memories_persona_idx").on(t.personaKey),
}));

export const knowledgeVersions = sqliteTable("knowledge_versions", {
  id: text("id").primaryKey(),
  entryType: text("entry_type", { enum: ["prompt", "skill", "memory"] }).notNull(),
  entryId: text("entry_id").notNull(),
  contentBefore: text("content_before"), // JSON 스냅샷 (변경 전 항목 전체)
  contentAfter: text("content_after"), // JSON 스냅샷 (변경 후 항목 전체)
  action: text("action", { enum: ["create", "update", "disable", "activate", "restore", "delete"] }).notNull(),
  changedBy: text("changed_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  entryIdx: index("knowledge_versions_entry_idx").on(t.entryType, t.entryId),
}));


export type Department = typeof departments.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Document = typeof documents.$inferSelect;

export type KnowledgePrompt = typeof knowledgePrompts.$inferSelect;
export type KnowledgeSkill = typeof knowledgeSkills.$inferSelect;
export type KnowledgeMemory = typeof knowledgeMemories.$inferSelect;
export type KnowledgeVersion = typeof knowledgeVersions.$inferSelect;

export type HarnessEntryType = "prompt" | "skill" | "memory";





export const episodes = sqliteTable("episodes", {
  id: text("id").primaryKey(),
  departmentId: text("department_id").notNull().references(() => departments.id),
  periodFrom: integer("period_from", { mode: "timestamp" }),
  periodTo: integer("period_to", { mode: "timestamp" }),
  summary: text("summary"),
  conclusion: text("conclusion"),
  sourceIds: text("source_ids"), // JSON (message id 목록)
  tokenCount: integer("token_count").notNull().default(0),
  status: text("status", { enum: ["draft", "ready", "reviewed"] }).notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  deptIdx: index("episodes_dept_idx").on(t.departmentId),
}));

export const improvementCandidates = sqliteTable("improvement_candidates", {
  id: text("id").primaryKey(),
  personaKey: text("persona_key").notNull(),
  sourceKind: text("source_kind", { enum: ["episode", "admin_chat", "knowledge_gap", "judgment_rule"] }).notNull(),
  sourceId: text("source_id").notNull(),
  requestType: text("request_type", { enum: ["episode", "admin_chat", "knowledge_gap", "judgment_rule"] }).notNull().default("admin_chat"),
  proposedByRole: text("proposed_by_role", { enum: ["user", "admin"] }).notNull().default("admin"),
  sourceConversationId: text("source_conversation_id"),
  summary: text("summary"),
  action: text("action", { enum: ["create_skill", "update_skill", "create_prompt", "update_prompt", "create_memory", "update_memory"] }).notNull(),
  targetTitle: text("target_title"),
  proposedContent: text("proposed_content"),
  confidence: real("confidence").notNull().default(0),
  relatedType: text("related_type"),
  relatedId: text("related_id"),
  status: text("status", { enum: ["pending", "approved", "rejected", "applied", "edited"] }).notNull().default("pending"),
  adminNote: text("admin_note"),
  resolvedBy: text("resolved_by"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  personaIdx: index("candidates_persona_idx").on(t.personaKey),
  statusIdx: index("candidates_status_idx").on(t.status),
}));

export const knowledgeEdges = sqliteTable("knowledge_edges", {
  id: text("id").primaryKey(),
  fromType: text("from_type").notNull(),
  fromId: text("from_id").notNull(),
  toType: text("to_type").notNull(),
  toId: text("to_id").notNull(),
  rel: text("rel", { enum: ["derives", "refutes", "supports", "related", "source_of"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  fromIdx: index("edges_from_idx").on(t.fromType, t.fromId),
}));


// ── 회의록 · 녹음 → 지식 적재 (015-F4) ──
export const meetings = sqliteTable("meetings", {
  id: text("id").primaryKey(),
  departmentId: text("department_id").notNull(),
  title: text("title").notNull(),
  categoryKey: text("category_key"),
  rawText: text("raw_text").notNull(),            // 녹취 원문
  minutesJson: text("minutes_json"),               // 회의록(참석/안건/결정/액션) JSON
  knowledgeApplied: integer("knowledge_applied", { mode: "boolean" }).notNull().default(false),
  sourceName: text("source_name"),
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  meetDeptIdx: index("meetings_dept_idx").on(t.departmentId),
}));
export type Episode = typeof episodes.$inferSelect;
export type NewEpisode = typeof episodes.$inferInsert;
export type ImprovementCandidate = typeof improvementCandidates.$inferSelect;
export type NewImprovementCandidate = typeof improvementCandidates.$inferInsert;
export type KnowledgeEdge = typeof knowledgeEdges.$inferSelect;
export type NewKnowledgeEdge = typeof knowledgeEdges.$inferInsert;
export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;

export const usersRelations = relations(users, ({ one }) => ({
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  department: one(departments, { fields: [conversations.departmentId], references: [departments.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
  department: one(departments, { fields: [documents.departmentId], references: [departments.id] }),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  users: many(users),
  conversations: many(conversations),
  documents: many(documents),
  datasets: many(departmentDatasets),
}));

export const departmentDatasetsRelations = relations(departmentDatasets, ({ one }) => ({
  department: one(departments, { fields: [departmentDatasets.departmentId], references: [departments.id] }),
}));


// ── 멀티턴 답변 → 단일 통합 Q/A (지식그래프 노드) ──
export const qaConsolidations = sqliteTable("qa_consolidations", {
  id: text("id").primaryKey(),
  canonicalQuestion: text("canonical_question").notNull(),
  intent: text("intent"),
  mergedAnswer: text("merged_answer").notNull(),
  summary: text("summary"),
  entities: text("entities"), // JSON array
  sourceConversationId: text("source_conversation_id"),
  status: text("status").notNull().default("draft"), // draft|verified|rejected
  confidence: real("confidence").notNull().default(0.5),
  turns: integer("turns").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  ragDocumentId: text("rag_document_id"), // RAGFlow 데이터셋 문서 id (벡터 인덱스)
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  qaQuestionIdx: index("qa_question_idx").on(t.canonicalQuestion),
  qaStatusIdx: index("qa_status_idx").on(t.status),
}));
export type QAConsolidation = typeof qaConsolidations.$inferSelect;
export type NewQAConsolidation = typeof qaConsolidations.$inferInsert;

export const qaLinks = sqliteTable("qa_links", {
  id: text("id").primaryKey(),
  fromId: text("from_id").notNull().references(() => qaConsolidations.id),
  toId: text("to_id").notNull().references(() => qaConsolidations.id),
  relation: text("relation").notNull(), // similar|follow_up|entails
  weight: real("weight").notNull().default(0.5),
}, (t) => ({
  qaLinkFromIdx: index("qa_link_from_idx").on(t.fromId),
}));
export type QALink = typeof qaLinks.$inferSelect;
export type NewQALink = typeof qaLinks.$inferInsert;


// ── 부서 워크큐: 일감 (대시보드·업무진도 모니터링 연동) (018-B) ──
export const workTasks = sqliteTable("work_tasks", {
  id: text("id").primaryKey(),
  personaKey: text("persona_key").notNull().default("claims-planning"),
  title: text("title").notNull(),
  assignee: text("assignee"),
  category: text("category"),               // 주간/월간/일반 등
  dueDate: text("due_date"),             // "YYYY-MM-DD"
  status: text("status", { enum: ["todo", "doing", "done", "delayed"] }).notNull().default("todo"),
  progress: integer("progress").notNull().default(0),   // 0~100
  source: text("source", { enum: ["director_note", "direct"] }).notNull().default("direct"),
  directorNoteRef: text("director_note_ref"),          // 부서장 의견 항목 참조
  content: text("content"),              // 진행 내용(주간/월간 업무 등)
  ragSynced: integer("rag_synced", { mode: "boolean" }).notNull().default(false), // RAG 등록 여부
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  wqPersonaIdx: index("wq_persona_idx").on(t.personaKey),
  wqStatusIdx: index("wq_status_idx").on(t.status),
}));

// ── 부서장 일정 캘린더 (부서장 직접 입력) ──
export const directorSchedule = sqliteTable("director_schedule", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),               // "YYYY-MM-DD"
  time: text("time"),                        // "HH:MM" (선택)
  title: text("title").notNull(),
  note: text("note"),
  attendees: text("attendees"),               // 참석자 (쉼표 구분, 선택)
  location: text("location"),                 // 장소 (선택)
  createdBy: text("created_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  dsDateIdx: index("director_schedule_date_idx").on(t.date),
}));
export type DirectorSchedule = typeof directorSchedule.$inferSelect;
export type NewDirectorSchedule = typeof directorSchedule.$inferInsert;

export type WorkTask = typeof workTasks.$inferSelect;
export type NewWorkTask = typeof workTasks.$inferInsert;
