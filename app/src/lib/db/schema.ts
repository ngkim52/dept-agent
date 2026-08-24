import { relations } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  personaKey: text("persona_key").notNull(),
  ragflowDatasetId: text("ragflow_dataset_id"), // 부서 ↔ RAGFlow 데이터셋 링크
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
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
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  departmentId: text("department_id").references(() => departments.id),
  title: text("title"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  citations: text("citations"), // JSON 문자열 (참조 근거)
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id), // 소유자
  departmentId: text("department_id").references(() => departments.id), // (선택) 부서 연계, 사용자별 관리는 userId 기준
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  ragflowDocId: text("ragflow_doc_id"),
  status: text("status", { enum: ["uploaded", "parsing", "done", "failed"] })
    .notNull()
    .default("done"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type Department = typeof departments.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Document = typeof documents.$inferSelect;



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
}));
